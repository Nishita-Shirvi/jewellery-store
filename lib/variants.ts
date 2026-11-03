/**
 * Product variants (Phase 17): pure helpers with no database access, so they can be unit-tested.
 *
 * A product has 0–3 options (e.g. "Ring size", "Metal colour"), each with values. Every combination
 * of one value per option is a variant with its own SKU, price, stock and weight. A product with no
 * options has a single "base" variant whose optionKey is "".
 */
import { z } from "zod";
import type { MetalColour, MetalType, Purity } from "@prisma/client";

export const MAX_OPTIONS = 3;
export const MAX_VALUES_PER_OPTION = 30;
/** Hard cap on combinations so a typo can't create thousands of rows. */
export const MAX_VARIANTS = 100;

/** Upper-case letters, digits and dashes; starts and ends with a letter/digit; 3–80 characters. */
export const skuSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9](?:[A-Z0-9-]{1,78})[A-Z0-9]$/, {
    message: "SKU: 3–80 capital letters, numbers and dashes (no dash at the start or end)",
  })
  .refine((v) => !v.includes("--"), { message: "SKU can't contain two dashes in a row" });

const optionName = z
  .string()
  .trim()
  .min(1, { message: "Name the option, e.g. Ring size" })
  .max(40)
  .regex(/^[\p{L}\p{N} ()'./-]+$/u, { message: "Option names: letters, numbers and spaces" });

const optionValue = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[\p{L}\p{N} ()'./+-]+$/u, { message: "Values: letters, numbers and spaces" });

export const optionsInputSchema = z
  .array(
    z.object({
      name: optionName,
      values: z
        .array(optionValue)
        .min(1, { message: "Give each option at least one value" })
        .max(MAX_VALUES_PER_OPTION),
    }),
  )
  .max(MAX_OPTIONS, { message: `At most ${MAX_OPTIONS} options` })
  .superRefine((options, ctx) => {
    const names = options.map((o) => o.name.toLowerCase());
    if (new Set(names).size !== names.length)
      ctx.addIssue({ code: "custom", message: "Two options have the same name" });
    for (const o of options) {
      const values = o.values.map((v) => v.toLowerCase());
      if (new Set(values).size !== values.length)
        ctx.addIssue({ code: "custom", message: `"${o.name}" lists the same value twice` });
    }
    const combos = options.reduce((n, o) => n * o.values.length, 1);
    if (combos > MAX_VARIANTS)
      ctx.addIssue({
        code: "custom",
        message: `That makes ${combos} combinations; the limit is ${MAX_VARIANTS}`,
      });
  });

export type OptionsInput = z.infer<typeof optionsInputSchema>;

/** Splits "10, 12, 14" (or one per line) into clean values. */
export function parseValueList(raw: string): string[] {
  return raw
    .split(/[,\n]/)
    .map((v) => v.trim())
    .filter(Boolean);
}

/** Every combination, one value per option, in option order: [["10","Yellow"],["10","Rose"],…]. */
export function combinations<T>(lists: T[][]): T[][] {
  if (lists.length === 0) return [[]];
  return lists.reduce<T[][]>(
    (acc, list) => acc.flatMap((combo) => list.map((value) => [...combo, value])),
    [[]],
  );
}

/** Order-independent key for a set of option value ids ("" = base variant). */
export function optionKeyFor(optionValueIds: string[]): string {
  return [...optionValueIds].sort().join(".");
}

/** "Ring size 12 / Rose" from [{name:"Ring size",value:"12"},{name:"Metal colour",value:"Rose"}]. */
export function variantLabel(parts: { name: string; value: string }[]): string {
  return parts
    .map((p) => (/size|length/i.test(p.name) ? `${p.name} ${p.value}` : p.value))
    .join(" / ");
}

/** Default SKU for a combination: PRODUCT-SLUG-12-ROSE (cleaned to the SKU alphabet). */
export function suggestSku(productSlug: string, values: string[]): string {
  const raw = [productSlug, ...values].join("-").toUpperCase();
  return raw
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80)
    .replace(/-$/, "");
}

/** If an option is the metal colour / purity, the variant overrides the product's value. */
export function enumOverrides(parts: { name: string; value: string }[]): {
  metalColour: MetalColour | null;
  purity: Purity | null;
} {
  let metalColour: MetalColour | null = null;
  let purity: Purity | null = null;
  for (const { name, value } of parts) {
    const v = value.trim().toLowerCase();
    if (/colou?r/i.test(name)) {
      if (v.startsWith("yellow")) metalColour = "YELLOW";
      else if (v.startsWith("white")) metalColour = "WHITE";
      else if (v.startsWith("rose")) metalColour = "ROSE";
    }
    if (/purity|karat|carat/i.test(name)) {
      const k = v.replace(/\s/g, "");
      if (k === "24k" || k === "24kt") purity = "K24";
      else if (k === "22k" || k === "22kt") purity = "K22";
      else if (k === "18k" || k === "18kt") purity = "K18";
      else if (k === "14k" || k === "14kt") purity = "K14";
    }
  }
  return { metalColour, purity };
}

/** The jewellery facts of one variant: its own weight, and colour/purity if it overrides them. */
export function variantJewellery<
  P extends { metalType: MetalType; purity: Purity; metalColour: MetalColour },
>(
  product: P,
  variant: {
    purity: Purity | null;
    metalColour: MetalColour | null;
    netWeightMg: number;
    grossWeightMg: number | null;
  },
) {
  return {
    metalType: product.metalType,
    purity: variant.purity ?? product.purity,
    metalColour: variant.metalColour ?? product.metalColour,
    netWeightMg: variant.netWeightMg,
    grossWeightMg: variant.grossWeightMg,
  };
}

/** Finds duplicate SKUs (case-insensitive) in one batch, e.g. a bulk edit. */
export function duplicateSkus(skus: string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const s of skus.map((x) => x.trim().toUpperCase())) {
    if (seen.has(s)) dupes.add(s);
    seen.add(s);
  }
  return [...dupes];
}

/** How an order/cart line is named everywhere: "Classic Ring (Ring size 12 / Rose)". */
export function lineName(productName: string, variantLabel?: string | null): string {
  return variantLabel ? `${productName} (${variantLabel})` : productName;
}
