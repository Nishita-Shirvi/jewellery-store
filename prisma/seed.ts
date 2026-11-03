/**
 * Seed script: 1 admin user, 4 jewellery categories, 20 dummy jewellery products (each with one
 * base variant), plus one demo ring with options (3 ring sizes × 2 metal colours = 6 variants).
 * Run with: npx prisma db seed
 *
 * Safe to run more than once: everything is upserted by email/slug.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { dummyCategories, dummyProducts } from "./seed-data/catalog";

const seedEnv = z
  .object({
    SEED_ADMIN_EMAIL: z.email({ message: "SEED_ADMIN_EMAIL must be a valid email" }),
    SEED_ADMIN_PASSWORD: z
      .string()
      .min(12, { message: "SEED_ADMIN_PASSWORD must be at least 12 characters" }),
  })
  .safeParse(process.env);

if (!seedEnv.success) {
  console.error("❌ Seed env vars missing or invalid:");
  for (const issue of seedEnv.error.issues)
    console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
  process.exit(1);
}

const db = new PrismaClient();
const BCRYPT_ROUNDS = 12;

async function seedAdmin() {
  const { SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD } = seedEnv.data!;
  const email = SEED_ADMIN_EMAIL.toLowerCase();
  const passwordHash = await bcrypt.hash(SEED_ADMIN_PASSWORD, BCRYPT_ROUNDS);

  await db.user.upsert({
    where: { email },
    update: { role: "ADMIN" }, // never overwrite an existing password on re-seed
    create: { email, name: "Store Admin", role: "ADMIN", passwordHash, emailVerified: new Date() },
  });
  console.log(`✔ Admin user: ${email}`);
}

async function seedCategories(): Promise<Map<string, string>> {
  const idsBySlug = new Map<string, string>();
  for (const [index, category] of dummyCategories.entries()) {
    const row = await db.category.upsert({
      where: { slug: category.slug },
      update: { name: category.name, image: category.image, sortOrder: index },
      create: { name: category.name, slug: category.slug, image: category.image, sortOrder: index },
    });
    idsBySlug.set(category.slug, row.id);
  }
  console.log(`✔ Categories: ${idsBySlug.size}`);
  return idsBySlug;
}

async function seedProducts(categoryIds: Map<string, string>) {
  for (const product of dummyProducts) {
    const categoryId = categoryIds.get(product.categorySlug);
    if (!categoryId)
      throw new Error(`Unknown category "${product.categorySlug}" for ${product.slug}`);

    const data = {
      name: product.name,
      description: product.description,
      priceInPaise: product.priceInPaise,
      stock: product.stock,
      images: product.images,
      isFeatured: product.isFeatured,
      isActive: true,
      categoryId,
      metalType: product.metalType,
      purity: product.purity,
      metalColour: product.metalColour,
      netWeightMg: product.netWeightMg,
      gemstone: product.gemstone,
    };

    const saved = await db.product.upsert({
      where: { slug: product.slug },
      update: data,
      create: { ...data, slug: product.slug },
      select: { id: true },
    });
    // Phase 17: every product is sold through a variant. Products without options have one.
    await db.productVariant.upsert({
      where: { productId_optionKey: { productId: saved.id, optionKey: "" } },
      update: {
        priceInPaise: product.priceInPaise,
        stock: product.stock,
        netWeightMg: product.netWeightMg,
      },
      create: {
        productId: saved.id,
        sku: product.slug.toUpperCase(),
        priceInPaise: product.priceInPaise,
        stock: product.stock,
        netWeightMg: product.netWeightMg,
        images: [],
      },
    });
  }
  console.log(`✔ Products: ${dummyProducts.length}`);
  // Build the search words for every product (same rules as services/search.service.ts; it also self-heals on first search).
  await db.$executeRaw`UPDATE "Product" SET "searchText" = '' `;
}

/** A ring sold in 3 sizes × 2 colours; each variant has its own SKU, price, stock and weight. */
async function seedVariantDemo(categoryIds: Map<string, string>) {
  const slug = "plain-gold-band";
  const categoryId = categoryIds.get("rings");
  if (!categoryId) throw new Error('Missing "rings" category');
  const product = await db.product.upsert({
    where: { slug },
    update: {},
    create: {
      name: "Plain Gold Band",
      slug,
      description: "A comfort-fit 22K gold band, made in your ring size, in yellow or rose gold.",
      priceInPaise: 2850000,
      stock: 0,
      images: ["/images/products/floral-band-ring.svg"],
      categoryId,
      metalType: "GOLD",
      purity: "K22",
      metalColour: "YELLOW",
      netWeightMg: 3000,
    },
    select: { id: true },
  });
  const options = [
    { name: "Ring size", values: ["10", "12", "14"] },
    { name: "Metal colour", values: ["Yellow", "Rose"] },
  ];
  const valueIds: string[][] = [];
  for (const [position, o] of options.entries()) {
    const option = await db.productOption.upsert({
      where: { productId_name: { productId: product.id, name: o.name } },
      update: {},
      create: { productId: product.id, name: o.name, position },
    });
    const ids: string[] = [];
    for (const [vpos, value] of o.values.entries()) {
      const row = await db.productOptionValue.upsert({
        where: { optionId_value: { optionId: option.id, value } },
        update: {},
        create: { optionId: option.id, value, position: vpos },
      });
      ids.push(row.id);
    }
    valueIds.push(ids);
  }
  let position = 0;
  for (const [si, size] of options[0]!.values.entries()) {
    for (const [ci, colour] of options[1]!.values.entries()) {
      const ids = [valueIds[0]![si]!, valueIds[1]![ci]!];
      const optionKey = [...ids].sort().join(".");
      const priceInPaise = 2850000 + si * 150000;
      await db.productVariant.upsert({
        where: { productId_optionKey: { productId: product.id, optionKey } },
        // Re-seeding resets the demo stock, like the other dummy products.
        update: { stock: 3, priceInPaise, isActive: true },
        create: {
          productId: product.id,
          sku: `PLAIN-GOLD-BAND-${size}-${colour.toUpperCase()}`,
          optionKey,
          label: `Ring size ${size} / ${colour}`,
          // Bigger sizes use more gold: price and weight go up with size.
          priceInPaise,
          netWeightMg: 3000 + si * 150,
          stock: 3,
          metalColour: colour === "Rose" ? "ROSE" : "YELLOW",
          position: position++,
          images: [],
          optionValues: { create: ids.map((optionValueId) => ({ optionValueId })) },
        },
      });
    }
  }
  console.log("✔ Variant demo: Plain Gold Band (6 variants)");
}

/** Product price/stock columns summarise their active variants (same rule as inventory.service). */
async function syncSummaries() {
  await db.$executeRaw`
    UPDATE "Product" p SET
      "stock" = COALESCE((SELECT SUM(v."stock") FROM "ProductVariant" v WHERE v."productId" = p."id" AND v."isActive"), 0),
      "reservedStock" = COALESCE((SELECT SUM(LEAST(v."reservedStock", v."stock")) FROM "ProductVariant" v WHERE v."productId" = p."id" AND v."isActive"), 0),
      "priceInPaise" = COALESCE((SELECT MIN(v."priceInPaise") FROM "ProductVariant" v WHERE v."productId" = p."id" AND v."isActive"), p."priceInPaise")`;
}

async function main() {
  await seedAdmin();
  const categoryIds = await seedCategories();
  await seedProducts(categoryIds);
  await seedVariantDemo(categoryIds);
  await syncSummaries();
  console.log("🌱 Seed finished.");
}

main()
  .catch((error: unknown) => {
    console.error("❌ Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
