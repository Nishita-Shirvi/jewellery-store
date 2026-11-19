import "server-only";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { csvRecords, csvRow } from "@/lib/report/csv";
import { productFormSchema } from "@/lib/validation/admin";
import {
  AdminInputError,
  createProduct,
  updateProduct,
} from "@/services/admin/product-admin.service";

/**
 * Bulk product import / export (Phase 29). One row per product, the same fields as the admin
 * product form — and each row is checked by the same rules (productFormSchema), so a CSV can't
 * create anything the form wouldn't allow. Import is all-or-nothing: if any row has a problem,
 * nothing is saved and every problem is listed with its line number.
 *
 * Products with sizes/colours (variants): price and stock live on each variant (Products → the
 * product → Variants), so for them those two columns are ignored, as on the form.
 */
export const PRODUCT_CSV_COLUMNS = [
  "slug",
  "name",
  "description",
  "category",
  "metal_type",
  "purity",
  "metal_colour",
  "net_weight_g",
  "gross_weight_g",
  "price",
  "stock",
  "making_charge",
  "gemstone",
  "huid",
  "hsn_code",
  "gst_rate",
  "tags",
  "country_of_origin",
  "images",
  "active",
  "featured",
  "returnable",
] as const;

export const MAX_IMPORT_ROWS = 2000;

const yes = (v: string | undefined) => /^(yes|y|true|1|on)$/i.test((v ?? "").trim());
const grams = (mg: number | null) =>
  mg === null ? "" : (mg / 1000).toFixed(3).replace(/\.?0+$/, "");
const rupees = (paise: number) => (paise / 100).toFixed(2).replace(/\.00$/, "");

/** Our own export protects cells against spreadsheet formulas with a leading ' — undo that. */
function unguard(v: string) {
  return /^'[=+\-@]/.test(v) ? v.slice(1) : v;
}

export async function exportProductsCsv(): Promise<string> {
  const products = await db.product.findMany({
    orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }],
    include: { category: { select: { slug: true } }, _count: { select: { options: true } } },
  });
  let out = csvRow([...PRODUCT_CSV_COLUMNS]);
  for (const p of products) {
    out += csvRow([
      p.slug,
      p.name,
      p.description,
      p.category.slug,
      p.metalType,
      p.purity,
      p.metalColour,
      grams(p.netWeightMg),
      grams(p.grossWeightMg),
      rupees(p.priceInPaise),
      p.stock,
      p.makingChargeInPaise ? rupees(p.makingChargeInPaise) : "",
      p.gemstone ?? "",
      p.huid ?? "",
      p.hsnCode,
      (p.gstRateBps / 100).toString(),
      p.tags.join(", "),
      p.countryOfOrigin,
      p.images.join(" | "),
      p.isActive ? "yes" : "no",
      p.isFeatured ? "yes" : "no",
      p.isReturnable ? "yes" : "no",
    ]);
  }
  return out;
}

export interface ImportRowResult {
  line: number;
  slug: string;
  action: "create" | "update" | "error";
  errors: string[];
  /** For products with variants: price/stock columns were ignored. */
  note?: string;
}

export interface ImportReport {
  rows: ImportRowResult[];
  created: number;
  updated: number;
  errors: number;
  applied: boolean;
}

/**
 * Checks every row (dryRun) or checks and then saves them all. Saving only happens when no row
 * has an error.
 */
export async function importProductsCsv(
  text: string,
  opts: { dryRun: boolean; adminId: string },
): Promise<ImportReport> {
  const records = csvRecords(text);
  if (records.length === 0) throw new AdminInputError("The file has no product rows.");
  if (records.length > MAX_IMPORT_ROWS)
    throw new AdminInputError(
      `Up to ${MAX_IMPORT_ROWS} rows per file — split it into smaller files.`,
    );
  const header = Object.keys(records[0]!.values);
  const missing = ["name", "category", "metal_type", "purity", "metal_colour", "price"].filter(
    (c) => !header.includes(c),
  );
  if (missing.length)
    throw new AdminInputError(
      `Missing column(s): ${missing.join(", ")}. Download the template to see them all.`,
    );

  const [categories, existing] = await Promise.all([
    db.category.findMany({ select: { id: true, slug: true } }),
    db.product.findMany({
      select: { id: true, slug: true, _count: { select: { options: true } } },
    }),
  ]);
  const categoryBySlug = new Map(categories.map((c) => [c.slug, c.id]));
  const productBySlug = new Map(existing.map((p) => [p.slug, p]));
  const seen = new Map<string, number>();

  const prepared: {
    result: ImportRowResult;
    input?: ReturnType<typeof productFormSchema.parse>;
    productId?: string;
  }[] = [];
  for (const { line, values: raw } of records) {
    const v = Object.fromEntries(Object.entries(raw).map(([k, x]) => [k, unguard(x)]));
    const slug = (v.slug ?? "").toLowerCase();
    const result: ImportRowResult = { line, slug: slug || "(new)", action: "create", errors: [] };
    const target = slug ? productBySlug.get(slug) : undefined;
    if (target) result.action = "update";
    if (slug) {
      if (seen.has(slug)) result.errors.push(`slug "${slug}" is also on line ${seen.get(slug)}`);
      else seen.set(slug, line);
    }
    const categoryId = categoryBySlug.get((v.category ?? "").toLowerCase());
    if (!categoryId) result.errors.push(`category "${v.category ?? ""}" doesn't exist`);
    const hasVariants = (target?._count.options ?? 0) > 0;
    if (hasVariants)
      result.note = "has sizes/colours: price and stock are set per variant (ignored here)";

    const parsed = productFormSchema.safeParse({
      name: v.name,
      slug: slug || undefined,
      description: v.description,
      categoryId: categoryId ?? "missing",
      price: v.price,
      makingCharge: v.making_charge ?? "",
      stock: v.stock || "0",
      metalType: (v.metal_type ?? "").toUpperCase(),
      purity: (v.purity ?? "").toUpperCase(),
      metalColour: (v.metal_colour ?? "").toUpperCase(),
      netWeight: v.net_weight_g ?? "",
      grossWeight: v.gross_weight_g ?? "",
      gemstone: v.gemstone ?? "",
      huid: v.huid ?? "",
      tags: v.tags ?? "",
      countryOfOrigin: v.country_of_origin ?? "",
      images: (v.images ?? "")
        .split("|")
        .map((s) => s.trim())
        .filter(Boolean)
        .join("\n"),
      hsnCode: v.hsn_code || undefined,
      gstRate: v.gst_rate || undefined,
      isActive: v.active === undefined || v.active === "" ? "on" : yes(v.active) ? "on" : "",
      isFeatured: yes(v.featured) ? "on" : "",
      isReturnable:
        v.returnable === undefined || v.returnable === "" ? "on" : yes(v.returnable) ? "on" : "",
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? "");
        if (field === "categoryId") continue; // already reported by name
        result.errors.push(`${columnFor(field)}: ${issue.message}`);
      }
    }
    if (result.errors.length) result.action = "error";
    prepared.push({
      result,
      input: parsed.success ? parsed.data : undefined,
      productId: target?.id,
    });
  }

  const rows = prepared.map((p) => p.result);
  const report: ImportReport = {
    rows,
    created: rows.filter((r) => r.action === "create").length,
    updated: rows.filter((r) => r.action === "update").length,
    errors: rows.filter((r) => r.action === "error").length,
    applied: false,
  };
  if (opts.dryRun || report.errors > 0) return report;

  for (const p of prepared) {
    if (p.productId) await updateProduct(p.productId, p.input!, opts.adminId);
    else await createProduct(p.input!, opts.adminId);
  }
  report.applied = true;
  logger.info("products.csv_imported", {
    created: report.created,
    updated: report.updated,
    adminId: opts.adminId,
  });
  return report;
}

const FIELD_COLUMN: Record<string, string> = {
  name: "name",
  slug: "slug",
  description: "description",
  price: "price",
  makingCharge: "making_charge",
  stock: "stock",
  metalType: "metal_type",
  purity: "purity",
  metalColour: "metal_colour",
  netWeight: "net_weight_g",
  grossWeight: "gross_weight_g",
  gemstone: "gemstone",
  huid: "huid",
  tags: "tags",
  countryOfOrigin: "country_of_origin",
  images: "images",
  hsnCode: "hsn_code",
  gstRate: "gst_rate",
};
function columnFor(field: string) {
  return FIELD_COLUMN[field] ?? field;
}
