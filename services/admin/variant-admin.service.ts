import "server-only";
import { revalidateTag } from "next/cache";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  combinations,
  duplicateSkus,
  enumOverrides,
  optionKeyFor,
  skuSchema,
  suggestSku,
  variantLabel,
  type OptionsInput,
} from "@/lib/variants";
import { AdminInputError } from "@/services/admin/product-admin.service";
import { CATALOG_TAG } from "@/services/catalog.service";
import { syncProductSummaries } from "@/services/inventory.service";

/**
 * Admin side of product variants (Phase 17).
 * Variants are never deleted (order lines point at them); they are switched off instead.
 */

type Tx = Prisma.TransactionClient;

export async function getVariantEditor(productId: string) {
  const product = await db.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      name: true,
      slug: true,
      priceInPaise: true,
      netWeightMg: true,
      options: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          name: true,
          values: { orderBy: { position: "asc" }, select: { id: true, value: true } },
        },
      },
      variants: {
        orderBy: [{ isActive: "desc" }, { position: "asc" }, { id: "asc" }],
        select: {
          id: true,
          sku: true,
          label: true,
          optionKey: true,
          priceInPaise: true,
          stock: true,
          reservedStock: true,
          netWeightMg: true,
          grossWeightMg: true,
          isActive: true,
          _count: { select: { orderItems: true } },
        },
      },
    },
  });
  return product;
}

/** A SKU that isn't used yet (adds -2, -3 … when the suggestion is taken). */
async function freeSku(tx: Tx, wanted: string, taken: Set<string>): Promise<string> {
  for (let i = 1; i < 1000; i++) {
    const suffix = i === 1 ? "" : `-${i}`;
    const candidate = `${wanted.slice(0, 80 - suffix.length).replace(/-+$/, "")}${suffix}`;
    if (taken.has(candidate)) continue;
    const clash = await tx.productVariant.findUnique({
      where: { sku: candidate },
      select: { id: true },
    });
    if (!clash) {
      taken.add(candidate);
      return candidate;
    }
  }
  throw new AdminInputError("Couldn't make a unique SKU. Edit the SKUs by hand.");
}

/**
 * Saves the option list and creates every missing combination (stock 0, product's current price
 * and weight). Variants that no longer match the options — including the base variant once the
 * product has options — are switched off. With no options, the base variant is switched back on.
 */
export async function saveOptions(productId: string, input: OptionsInput, adminId: string) {
  const result = await db.$transaction(async (tx) => {
    const product = await tx.product.findUnique({
      where: { id: productId },
      select: { id: true, slug: true, priceInPaise: true, netWeightMg: true, grossWeightMg: true },
    });
    if (!product) throw new AdminInputError("Product not found.");

    // 1. Options and values: keep matching ones, add new ones, remove the rest.
    const keptOptionIds: string[] = [];
    const valueLists: { id: string; name: string; value: string }[][] = [];
    for (const [position, o] of input.entries()) {
      const option = await tx.productOption.upsert({
        where: { productId_name: { productId, name: o.name } },
        update: { position },
        create: { productId, name: o.name, position },
      });
      keptOptionIds.push(option.id);
      const list: { id: string; name: string; value: string }[] = [];
      for (const [vpos, value] of o.values.entries()) {
        const row = await tx.productOptionValue.upsert({
          where: { optionId_value: { optionId: option.id, value } },
          update: { position: vpos },
          create: { optionId: option.id, value, position: vpos },
        });
        list.push({ id: row.id, name: o.name, value });
      }
      await tx.productOptionValue.deleteMany({
        where: { optionId: option.id, id: { notIn: list.map((v) => v.id) } },
      });
      valueLists.push(list);
    }
    await tx.productOption.deleteMany({ where: { productId, id: { notIn: keptOptionIds } } });

    // 2. Every combination that should exist.
    const combos = input.length === 0 ? [] : combinations(valueLists);
    const wantedKeys = new Set(combos.map((c) => optionKeyFor(c.map((v) => v.id))));
    if (input.length === 0) wantedKeys.add("");

    const existing = await tx.productVariant.findMany({
      where: { productId },
      select: { id: true, optionKey: true, isActive: true },
    });
    const byKey = new Map(existing.map((v) => [v.optionKey, v]));

    // 3. Switch off variants that no longer fit; switch the base variant back on if needed.
    const toDeactivate = existing.filter((v) => v.isActive && !wantedKeys.has(v.optionKey));
    for (const v of [...toDeactivate].sort((a, b) => a.id.localeCompare(b.id))) {
      await tx.productVariant.update({ where: { id: v.id }, data: { isActive: false } });
    }
    const base = byKey.get("");
    if (input.length === 0 && base && !base.isActive)
      await tx.productVariant.update({ where: { id: base.id }, data: { isActive: true } });

    // 4. Create the missing combinations.
    const taken = new Set<string>();
    let created = 0;
    for (const [position, combo] of combos.entries()) {
      const ids = combo.map((v) => v.id);
      const key = optionKeyFor(ids);
      const found = byKey.get(key);
      if (found) {
        await tx.productVariant.update({ where: { id: found.id }, data: { position } });
        continue;
      }
      const parts = combo.map((v) => ({ name: v.name, value: v.value }));
      const sku = await freeSku(
        tx,
        suggestSku(
          product.slug,
          combo.map((v) => v.value),
        ),
        taken,
      );
      await tx.productVariant.create({
        data: {
          productId,
          sku,
          optionKey: key,
          label: variantLabel(parts),
          priceInPaise: product.priceInPaise,
          stock: 0,
          netWeightMg: product.netWeightMg,
          grossWeightMg: product.grossWeightMg,
          images: [],
          position,
          ...enumOverrides(parts),
          optionValues: { create: ids.map((optionValueId) => ({ optionValueId })) },
        },
      });
      created++;
    }
    await syncProductSummaries(tx, [productId]);
    return { created, deactivated: toDeactivate.length, combinations: combos.length };
  });
  revalidateTag(CATALOG_TAG);
  logger.info("admin.variant_options_saved", { adminId, productId, ...result });
  return result;
}

export interface VariantRowInput {
  id: string;
  sku: string;
  priceInPaise: number;
  stock: number;
  netWeightMg: number;
  grossWeightMg: number | null;
  isActive: boolean;
}

/**
 * Saves the bulk-edit grid. Checks SKU format and duplicates (in the grid and across the store),
 * and never lets stock fall below the units held in checkouts right now.
 * Returns what changed, for the audit log.
 */
export async function bulkUpdateVariants(
  productId: string,
  rows: VariantRowInput[],
  adminId: string,
) {
  if (rows.length === 0) throw new AdminInputError("Nothing to save.");
  const skus: string[] = [];
  for (const row of rows) {
    const parsed = skuSchema.safeParse(row.sku);
    if (!parsed.success)
      throw new AdminInputError(`"${row.sku}": ${parsed.error.issues[0]?.message}`);
    row.sku = parsed.data;
    skus.push(parsed.data);
  }
  const dupes = duplicateSkus(skus);
  if (dupes.length) throw new AdminInputError(`The same SKU is used twice: ${dupes.join(", ")}`);

  const changes: Record<string, { from: unknown; to: unknown }> = {};
  try {
    await db.$transaction(async (tx) => {
      const current = await tx.productVariant.findMany({
        where: { productId },
        select: {
          id: true,
          sku: true,
          priceInPaise: true,
          stock: true,
          isActive: true,
          reservedStock: true,
        },
      });
      const byId = new Map(current.map((v) => [v.id, v]));
      for (const row of rows) {
        if (!byId.has(row.id))
          throw new AdminInputError("A variant doesn't belong to this product.");
      }
      // Two variants swapping SKUs would trip the unique index mid-way: park them first.
      const renamed = rows.filter((r) => byId.get(r.id)!.sku !== r.sku);
      for (const row of [...renamed].sort((a, b) => a.id.localeCompare(b.id))) {
        await tx.productVariant.update({
          where: { id: row.id },
          data: { sku: `TMP-${row.id}`.toUpperCase().slice(0, 80) },
        });
      }
      for (const row of [...rows].sort((a, b) => a.id.localeCompare(b.id))) {
        const before = byId.get(row.id)!;
        await tx.productVariant.update({
          where: { id: row.id },
          data: {
            sku: row.sku,
            priceInPaise: row.priceInPaise,
            netWeightMg: row.netWeightMg,
            grossWeightMg: row.grossWeightMg,
            isActive: row.isActive,
          },
        });
        const updated = await tx.$executeRaw`
          UPDATE "ProductVariant" SET "stock" = ${row.stock}, "updatedAt" = NOW()
          WHERE "id" = ${row.id} AND "reservedStock" <= ${row.stock}`;
        if (updated === 0)
          throw new AdminInputError(
            `${row.sku}: stock can't go below the ${before.reservedStock} unit(s) held in checkouts right now.`,
          );
        for (const [field, from, to] of [
          ["sku", before.sku, row.sku],
          ["price", before.priceInPaise, row.priceInPaise],
          ["stock", before.stock, row.stock],
          ["active", before.isActive, row.isActive],
        ] as const) {
          if (from !== to) changes[`${row.sku}.${field}`] = { from, to };
        }
      }
      await syncProductSummaries(tx, [productId]);
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      throw new AdminInputError("One of these SKUs is already used by another product.");
    throw error;
  }
  revalidateTag(CATALOG_TAG);
  logger.info("admin.variants_updated", {
    adminId,
    productId,
    changed: Object.keys(changes).length,
  });
  return changes;
}
