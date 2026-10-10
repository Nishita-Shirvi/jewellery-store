import { z } from "zod";
import { INDIAN_STATES } from "@/lib/india";

const text = (label: string, max: number) =>
  z
    .string({ message: `Enter ${label}` })
    .trim()
    .min(1, { message: `Enter ${label}` })
    .max(max, { message: `${label[0]?.toUpperCase()}${label.slice(1)} is too long` });

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

export const addressSchema = z.object({
  fullName: text("the full name", 80).pipe(z.string().min(2, { message: "Name is too short" })),
  // 10-digit Indian mobile; "+91 98765 43210" and "098765-43210" are accepted and cleaned.
  phone: z
    .string({ message: "Enter a mobile number" })
    .transform((v) => v.replace(/[\s-]/g, "").replace(/^(\+91|91|0)(?=\d{10}$)/, ""))
    .pipe(z.string().regex(/^[6-9]\d{9}$/, { message: "Enter a valid 10-digit mobile number" })),
  line1: text("the house / flat and street", 120),
  line2: optionalText(120),
  landmark: optionalText(80),
  city: text("the city", 60),
  state: z.enum(INDIAN_STATES, { message: "Choose a state" }),
  pincode: z
    .string({ message: "Enter a pincode" })
    .trim()
    .regex(/^[1-9]\d{5}$/, { message: "Enter a valid 6-digit pincode" }),
});

export type AddressInput = z.infer<typeof addressSchema>;

const id = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[a-z0-9]+$/i);

export const couponCodeSchema = z
  .string()
  .trim()
  .max(32)
  .optional()
  .transform((v) => (v ? v : undefined));

export const startCheckoutSchema = z.object({
  addressId: id,
  checkoutKey: z.uuid(),
  couponCode: couponCodeSchema,
});

export const verifyPaymentSchema = z.object({
  orderId: id,
  razorpay_order_id: z.string().regex(/^order_[A-Za-z0-9]{6,40}$/),
  razorpay_payment_id: z.string().regex(/^pay_[A-Za-z0-9]{6,40}$/),
  razorpay_signature: z.string().regex(/^[a-f0-9]{64}$/),
});

export const orderIdSchema = z.object({ orderId: id });

export const returnRequestSchema = z.object({
  orderId: id,
  reason: z.enum(
    ["DAMAGED", "WRONG_ITEM", "NOT_AS_DESCRIBED", "SIZE_ISSUE", "CHANGED_MIND", "OTHER"],
    { message: "Choose a reason" },
  ),
  details: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((v) => v || undefined),
  photoUrl: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || undefined)
    .pipe(
      z
        .string()
        .regex(/^https:\/\/res\.cloudinary\.com\/\S+$/)
        .optional(),
    ),
  items: z
    .array(z.object({ orderItemId: id, quantity: z.coerce.number().int().min(1).max(100) }))
    .min(1, { message: "Choose at least one item to return" })
    .max(50),
});
