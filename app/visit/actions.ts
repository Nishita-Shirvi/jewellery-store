"use server";

import { headers } from "next/headers";
import { getCurrentUser } from "@/lib/auth-guards";
import { config } from "@/lib/config";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request";
import { visitRequestSchema } from "@/lib/validation/storefront";
import { VisitError, createVisitRequest } from "@/services/visit.service";

export interface VisitFormState {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  values?: Record<string, string>;
}

export async function requestVisitAction(
  _prev: VisitFormState,
  formData: FormData,
): Promise<VisitFormState> {
  if (!config.features.visit_booking) return { error: "Visit booking is not available." };
  const values: Record<string, string> = {};
  for (const [k, v] of formData.entries()) if (typeof v === "string") values[k] = v;

  const parsed = visitRequestSchema.safeParse(values);
  if (!parsed.success) {
    // A filled honeypot means a bot: pretend it worked, save nothing.
    if (values.website) return { ok: true };
    return {
      error: "Please check the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
      values,
    };
  }

  const ip = getClientIp(await headers());
  if (!rateLimit(`visit:${ip}`, 5, 60 * 60 * 1000).ok) {
    return { error: "Too many requests. Please call or WhatsApp us instead.", values };
  }

  const user = await getCurrentUser();
  try {
    await createVisitRequest({ ...parsed.data, userId: user?.id ?? null });
    return { ok: true };
  } catch (error) {
    if (error instanceof VisitError) {
      return { error: error.message, fieldErrors: { preferredDate: [error.message] }, values };
    }
    logger.error("visit.request_failed", { error });
    return { error: "Something went wrong. Please try again.", values };
  }
}
