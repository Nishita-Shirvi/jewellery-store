/**
 * Admin form validation for merchandising and CMS (Phase 24).
 * Dates arrive from <input type="datetime-local"> and are read as India time.
 */
import { z } from "zod";
import { collectionRulesSchema, parseIstLocal, safeContentLink, TAG_RE } from "@/lib/merch";
/** URL part: lower-case words joined by dashes, e.g. "diwali-gold-sale". */
const contentSlug = z
  .string()
  .trim()
  .toLowerCase()
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: "Lower-case letters, numbers and dashes, e.g. diwali-gold-sale",
  });

const text = (max: number) => z.string().trim().max(max).default("");
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || null);

/** Banner/announcement links: a path on this site or an https address (see safeContentLink). */
const link = z
  .string()
  .trim()
  .max(500)
  .optional()
  .transform((v, ctx) => {
    if (!v) return null;
    const safe = safeContentLink(v);
    if (!safe) {
      ctx.addIssue({
        code: "custom",
        message: "Use a page on this site (e.g. /collections/bridal) or an https:// link",
      });
      return z.NEVER;
    }
    return safe;
  });

/** Images: uploaded (our Cloudinary) or bundled /images/... files. */
const image = z
  .string()
  .trim()
  .max(500)
  .optional()
  .transform((v) => v || null)
  .refine(
    (v) =>
      v === null ||
      /^\/images\/[a-z0-9/_-]+\.(svg|png|jpe?g|webp)$/i.test(v) ||
      /^https:\/\/res\.cloudinary\.com\/[^\s"'<>]+$/i.test(v),
    { message: "Use an uploaded image or an /images/... path" },
  );

const when = z
  .string()
  .optional()
  .transform((v, ctx) => {
    const d = parseIstLocal(v);
    if (d === undefined) {
      ctx.addIssue({ code: "custom", message: "Pick a date and time" });
      return z.NEVER;
    }
    return d;
  });

const status = z.enum(["DRAFT", "PUBLISHED"]).default("DRAFT");

/** Shared: start/end dates must make sense. */
function datesInOrder<T extends { startsAt: Date | null; endsAt: Date | null }>(
  v: T,
  ctx: z.RefinementCtx,
) {
  if (v.startsAt && v.endsAt && v.endsAt <= v.startsAt)
    ctx.addIssue({ code: "custom", path: ["endsAt"], message: "Ends before it starts" });
}

const rupeesOrEmpty = z
  .string()
  .trim()
  .optional()
  .transform((v, ctx) => {
    if (!v) return undefined;
    if (!/^\d{1,8}$/.test(v)) {
      ctx.addIssue({ code: "custom", message: "Whole rupees, e.g. 25000" });
      return z.NEVER;
    }
    return Number(v);
  });

export const collectionFormSchema = z
  .object({
    id: z.string().max(40).optional(),
    title: z.string().trim().min(2, { message: "Enter a title" }).max(120),
    slug: contentSlug,
    description: text(4000),
    seoTitle: optionalText(120),
    seoDescription: optionalText(300),
    image,
    kind: z.enum(["MANUAL", "RULE"]),
    status,
    startsAt: when,
    endsAt: when,
    // Rule fields (RULE collections)
    ruleCategory: z.string().trim().max(80).optional(),
    ruleMetal: z.enum(["", "GOLD", "SILVER", "PLATINUM"]).optional(),
    ruleTags: z.string().max(600).optional(),
    ruleMinPrice: rupeesOrEmpty,
    ruleMaxPrice: rupeesOrEmpty,
    ruleOnSale: z.literal("on").optional(),
    ruleNewDays: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v ? Number(v) : undefined))
      .pipe(z.number().int().min(1).max(365).optional()),
  })
  .superRefine(datesInOrder)
  .transform((v, ctx) => {
    const tags = (v.ruleTags ?? "")
      .split(",")
      .map((t) =>
        t
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, ""),
      )
      .filter((t) => TAG_RE.test(t));
    const rules = collectionRulesSchema.safeParse({
      ...(v.ruleCategory ? { categorySlug: v.ruleCategory } : {}),
      ...(v.ruleMetal ? { metalType: v.ruleMetal } : {}),
      ...(tags.length ? { tags } : {}),
      ...(v.ruleMinPrice !== undefined ? { minPrice: v.ruleMinPrice } : {}),
      ...(v.ruleMaxPrice !== undefined ? { maxPrice: v.ruleMaxPrice } : {}),
      ...(v.ruleOnSale ? { onSale: true } : {}),
      ...(v.ruleNewDays ? { newWithinDays: v.ruleNewDays } : {}),
    });
    if (!rules.success) {
      ctx.addIssue({
        code: "custom",
        path: ["ruleMinPrice"],
        message: rules.error.issues[0]?.message ?? "Check the rules",
      });
      return z.NEVER;
    }
    return {
      id: v.id,
      title: v.title,
      slug: v.slug,
      description: v.description,
      seoTitle: v.seoTitle,
      seoDescription: v.seoDescription,
      image: v.image,
      kind: v.kind,
      status: v.status,
      startsAt: v.startsAt,
      endsAt: v.endsAt,
      rules: v.kind === "RULE" ? rules.data : {},
    };
  });
export type CollectionFormInput = z.infer<typeof collectionFormSchema>;

export const homeSectionFormSchema = z
  .object({
    id: z.string().max(40).optional(),
    kind: z.enum(["HERO", "PRODUCTS", "BANNER", "TEXT"]),
    title: text(120),
    subtitle: text(300),
    body: text(2000),
    linkUrl: link,
    linkLabel: optionalText(40),
    imageDesktop: image,
    imageMobile: image,
    collectionId: optionalText(40),
    position: z.coerce.number().int().min(0).max(999).default(0),
    status,
    startsAt: when,
    endsAt: when,
  })
  .superRefine(datesInOrder)
  .superRefine((v, ctx) => {
    if ((v.kind === "HERO" || v.kind === "BANNER") && !v.imageDesktop)
      ctx.addIssue({ code: "custom", path: ["imageDesktop"], message: "Add an image" });
    if (v.kind === "PRODUCTS" && !v.collectionId)
      ctx.addIssue({ code: "custom", path: ["collectionId"], message: "Pick a collection" });
    if ((v.kind === "HERO" || v.kind === "TEXT" || v.kind === "PRODUCTS") && !v.title)
      ctx.addIssue({ code: "custom", path: ["title"], message: "Enter a heading" });
    if (v.linkLabel && !v.linkUrl)
      ctx.addIssue({ code: "custom", path: ["linkUrl"], message: "Add the link for the button" });
  });
export type HomeSectionFormInput = z.infer<typeof homeSectionFormSchema>;

export const announcementFormSchema = z
  .object({
    id: z.string().max(40).optional(),
    message: z.string().trim().min(3, { message: "Write the message" }).max(160),
    linkUrl: link,
    linkLabel: optionalText(30),
    priority: z.coerce.number().int().min(0).max(100).default(0),
    status,
    startsAt: when,
    endsAt: when,
  })
  .superRefine(datesInOrder);
export type AnnouncementFormInput = z.infer<typeof announcementFormSchema>;

export const contentPageFormSchema = z.object({
  id: z.string().max(40).optional(),
  title: z.string().trim().min(2, { message: "Enter a title" }).max(120),
  slug: contentSlug,
  draftBody: z.string().max(20_000).default(""),
  seoDescription: optionalText(300),
});
export type ContentPageFormInput = z.infer<typeof contentPageFormSchema>;

/** Manual collection products: one product slug (or product URL) per line, in display order. */
export function parseProductList(input: string): string[] {
  const slugs = input
    .split(/\r?\n|,/)
    .map((l) =>
      l
        .trim()
        .replace(/^.*\/products\//, "")
        .replace(/[?#].*$/, ""),
    )
    .filter((l) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(l));
  return [...new Set(slugs)].slice(0, 200);
}
