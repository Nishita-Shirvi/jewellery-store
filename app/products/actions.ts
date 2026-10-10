"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { getClientIp } from "@/lib/request";
import { rateLimit } from "@/lib/rate-limit";
import { checkPincode, type PincodeCheck } from "@/services/shipment.service";

const pincodeSchema = z
  .string()
  .trim()
  .regex(/^[1-9]\d{5}$/);

export async function checkPincodeAction(
  pincode: string,
): Promise<PincodeCheck | { status: "invalid" } | { status: "rate_limited" }> {
  const parsed = pincodeSchema.safeParse(pincode);
  if (!parsed.success) return { status: "invalid" };
  const limit = rateLimit(`pincode:${getClientIp(await headers())}`, 30, 60_000);
  if (!limit.ok) return { status: "rate_limited" };
  return checkPincode(parsed.data);
}
