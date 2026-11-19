import { z } from "zod";
import { PURITIES } from "@/lib/metal-pricing";
import { parseRupeesToPaise } from "@/lib/money";
import { VISIT_SLOTS } from "@/lib/storefront";
import { whatsappDigits } from "@/lib/support";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v ?? "");

const checkbox = z
  .union([z.literal("on"), z.literal("true"), z.literal("false"), z.literal("")])
  .optional()
  .transform((v) => v === "on" || v === "true");

/** Showroom details admins can edit in /admin/settings (legal details stay in config/business.ini). */
export const storefrontSettingsSchema = z.object({
  showroomAddress: optionalText(300),
  hours: optionalText(120),
  phone: optionalText(20),
  whatsapp: optionalText(20).refine((v) => v === "" || whatsappDigits(v) !== null, {
    message: "Enter a 10-digit mobile number, or with country code",
  }),
  mapUrl: optionalText(500).refine((v) => v === "" || /^https:\/\/[^\s<>"]+$/.test(v), {
    message: "Paste a full https:// link (e.g. from Google Maps → Share)",
  }),
});

export type StorefrontSettings = z.infer<typeof storefrontSettingsSchema>;

export const DEFAULT_STOREFRONT: StorefrontSettings = {
  showroomAddress: "",
  hours: "Monday–Saturday, 10 am – 7 pm",
  phone: "",
  whatsapp: "",
  mapUrl: "",
};

/**
 * Metal rate form: one optional "rupees per gram" box per purity. Empty boxes keep the
 * current rate. `confirmLarge` must be ticked for changes above [pricing] large_change_percent.
 */
export const metalRateFormSchema = z
  .object(
    Object.fromEntries(
      PURITIES.map((p) => [
        p,
        z
          .string()
          .trim()
          .optional()
          .transform((v, ctx) => {
            if (!v) return undefined;
            const paise = parseRupeesToPaise(v);
            if (paise === null || paise <= 0 || paise > 10_000_000) {
              ctx.addIssue({ code: "custom", message: "Enter rupees per gram, e.g. 7250" });
              return undefined;
            }
            return paise;
          }),
      ]),
    ) as unknown as Record<(typeof PURITIES)[number], z.ZodType<number | undefined>>,
  )
  .extend({ confirmLarge: checkbox });

const indianMobile = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, "").replace(/^(\+91|91|0)(?=\d{10}$)/, ""))
  .pipe(z.string().regex(/^[6-9]\d{9}$/, { message: "Enter a 10-digit mobile number" }));

/** Public "Book a showroom visit" form. `website` is a honeypot that people never see. */
export const visitRequestSchema = z.object({
  name: z.string().trim().min(2, { message: "Enter your name" }).max(80),
  phone: indianMobile,
  email: z
    .union([z.literal(""), z.string().trim().email({ message: "Enter a valid email" }).max(254)])
    .optional()
    .transform((v) => v || null),
  preferredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Choose a date" }),
  timeSlot: z.enum(VISIT_SLOTS, { message: "Choose a time" }),
  message: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => v || null),
  productSlug: z
    .string()
    .regex(/^[a-z0-9-]{1,120}$/)
    .optional()
    .or(z.literal(""))
    .transform((v) => v || null),
  website: z.string().max(0).optional(),
});

export const visitStatusSchema = z.object({
  id: z.string().regex(/^[a-z0-9]{1,40}$/i),
  status: z.enum(["NEW", "CONFIRMED", "COMPLETED", "CANCELLED"]),
  adminNote: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => v || null),
});
