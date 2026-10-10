import { z } from "zod";
import { parseGramsToMg, parseRupeesToPaise } from "@/lib/money";
import { parseRatePercent } from "@/lib/gst";

const id = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[a-z0-9]+$/i);
const slug = z
  .string()
  .trim()
  .toLowerCase()
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: "Use lowercase letters, numbers and dashes only",
  });

const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());

const rupees = (label: string, { required = true } = {}) =>
  z
    .string()
    .trim()
    .transform((v, ctx) => {
      if (!v) {
        if (required) ctx.addIssue({ code: "custom", message: `Enter the ${label}` });
        return 0;
      }
      const paise = parseRupeesToPaise(v);
      if (paise === null) {
        ctx.addIssue({
          code: "custom",
          message: `Enter the ${label} in rupees, e.g. 68500 or 1999.50`,
        });
        return 0;
      }
      return paise;
    });

const grams = (label: string, { required = true } = {}) =>
  z
    .string()
    .trim()
    .transform((v, ctx) => {
      if (!v) {
        if (required) ctx.addIssue({ code: "custom", message: `Enter the ${label}` });
        return null;
      }
      const mg = parseGramsToMg(v);
      if (mg === null || mg === 0) {
        ctx.addIssue({ code: "custom", message: `Enter the ${label} in grams, e.g. 4.125` });
        return null;
      }
      return mg;
    });

/** Local placeholder images or uploaded images on Cloudinary. */
export const imageUrlSchema = z
  .string()
  .trim()
  .refine(
    (v) =>
      /^\/images\/[a-z0-9/_-]+\.(svg|png|jpe?g|webp)$/i.test(v) ||
      /^https:\/\/res\.cloudinary\.com\/[^\s]+$/i.test(v),
    { message: "Images must be uploaded files or /images/... paths" },
  );

export const productFormSchema = z
  .object({
    name: z.string().trim().min(2, { message: "Enter a name" }).max(120),
    slug: z
      .union([z.literal(""), slug])
      .optional()
      .transform((v) => v || undefined),
    description: z
      .string()
      .trim()
      .min(10, { message: "Write at least a short description" })
      .max(4000),
    categoryId: id,
    price: rupees("price"),
    makingCharge: rupees("making charge", { required: false }),
    stock: z.coerce
      .number({ message: "Enter stock" })
      .int({ message: "Stock must be a whole number" })
      .min(0)
      .max(100000),
    metalType: z.enum(["GOLD", "SILVER", "PLATINUM"]),
    purity: z.enum(["K24", "K22", "K18", "K14", "S925", "PT950"]),
    metalColour: z.enum(["YELLOW", "WHITE", "ROSE", "SILVER"]),
    netWeight: grams("net weight"),
    grossWeight: grams("gross weight", { required: false }),
    gemstone: z
      .string()
      .trim()
      .max(200)
      .optional()
      .transform((v) => v || null),
    huid: z
      .string()
      .trim()
      .toUpperCase()
      .optional()
      .transform((v) => v || null)
      .pipe(
        z
          .string()
          .regex(/^[A-Z0-9]{6}$/, { message: "HUID is 6 letters/numbers" })
          .nullable(),
      ),
    images: z
      .string()
      .transform((v) =>
        v
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean),
      )
      .pipe(z.array(imageUrlSchema).min(1, { message: "Add at least one image" }).max(10)),
    hsnCode: z
      .string()
      .trim()
      .regex(/^\d{4,8}$/, { message: "HSN is 4–8 digits (jewellery: 7113)" })
      .default("7113"),
    gstRate: z
      .string()
      .trim()
      .default("3")
      .transform((v, ctx) => {
        const bps = parseRatePercent(v);
        if (bps === null) {
          ctx.addIssue({ code: "custom", message: "Enter the GST rate in %, e.g. 3" });
          return 300;
        }
        return bps;
      }),
    isActive: checkbox,
    isFeatured: checkbox,
    isReturnable: checkbox,
  })
  .refine((d) => d.price > 0, { message: "Price must be more than ₹0", path: ["price"] })
  .refine((d) => d.grossWeight === null || d.netWeight === null || d.grossWeight >= d.netWeight, {
    message: "Gross weight can't be less than net weight",
    path: ["grossWeight"],
  });

export type ProductFormInput = z.infer<typeof productFormSchema>;

export const categoryFormSchema = z.object({
  name: z.string().trim().min(2, { message: "Enter a name" }).max(80),
  slug: z
    .union([z.literal(""), slug])
    .optional()
    .transform((v) => v || undefined),
  description: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => v || null),
  sortOrder: z.coerce.number().int().min(0).max(1000).default(0),
  isActive: checkbox,
});

export type CategoryFormInput = z.infer<typeof categoryFormSchema>;

export const idSchema = z.object({ id });

export const stockUpdateSchema = z.object({
  id,
  stock: z.coerce.number().int().min(0).max(100000),
});

export const orderStatusUpdateSchema = z.object({
  id,
  status: z.enum(["PENDING", "PAID", "SHIPPED", "DELIVERED", "CANCELLED", "FAILED"]),
});

export const adminListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).catch(1).default(1),
  q: z.string().trim().max(100).optional().catch(undefined),
  status: z.string().max(20).optional().catch(undefined),
});

export function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 100) || "item"
  );
}

/** "2026-10-31T23:59" from <input type="datetime-local">, read as India time. */
const istDateTime = z
  .string()
  .trim()
  .optional()
  .transform((v, ctx) => {
    if (!v) return null;
    const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(v);
    if (!m) {
      ctx.addIssue({ code: "custom", message: "Choose a date and time" });
      return null;
    }
    return new Date(`${m[1]}T${m[2]}:00+05:30`);
  });

const optionalCount = z
  .string()
  .trim()
  .optional()
  .transform((v, ctx) => {
    if (!v) return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1 || n > 1_000_000) {
      ctx.addIssue({
        code: "custom",
        message: "Enter a whole number, or leave empty for no limit",
      });
      return null;
    }
    return n;
  });

export const couponFormSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9_-]{2,32}$/, { message: "2–32 letters, numbers, - or _" }),
    type: z.enum(["PERCENT", "FLAT"]),
    value: z.string().trim(),
    minOrder: rupees("minimum order", { required: false }),
    maxDiscount: z
      .string()
      .trim()
      .optional()
      .transform((v, ctx) => {
        if (!v) return null;
        const paise = parseRupeesToPaise(v);
        if (!paise) {
          ctx.addIssue({ code: "custom", message: "Enter rupees, e.g. 2000" });
          return null;
        }
        return paise;
      }),
    startsAt: istDateTime,
    endsAt: istDateTime,
    usageLimit: optionalCount,
    perUserLimit: optionalCount,
    isActive: checkbox,
  })
  .transform((d, ctx) => {
    let value = 0;
    if (d.type === "PERCENT") {
      value = Number(d.value);
      if (!Number.isInteger(value) || value < 1 || value > 90)
        ctx.addIssue({ code: "custom", path: ["value"], message: "Percent must be 1–90" });
    } else {
      value = parseRupeesToPaise(d.value) ?? 0;
      if (value <= 0)
        ctx.addIssue({
          code: "custom",
          path: ["value"],
          message: "Enter the amount off in rupees",
        });
    }
    if (d.startsAt && d.endsAt && d.endsAt <= d.startsAt)
      ctx.addIssue({ code: "custom", path: ["endsAt"], message: "End must be after start" });
    return { ...d, value };
  });

export type CouponFormInput = z.infer<typeof couponFormSchema>;
