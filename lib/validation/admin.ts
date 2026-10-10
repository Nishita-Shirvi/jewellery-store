import { z } from "zod";
import { parseGramsToMg, parseRupeesToPaise } from "@/lib/money";

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
