"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth-guards";
import { rateLimit } from "@/lib/rate-limit";
import {
  SupportError,
  createTicket,
  customerReply,
  customerResolve,
  readAttachments,
} from "@/services/support.service";

/** Customer support actions (Phase 22). Only ever act on the signed-in customer's tickets. */

export interface TicketFormState {
  error?: string;
  values?: { subject?: string; body?: string; category?: string; orderId?: string };
}

const id = z.string().regex(/^[a-z0-9]{1,40}$/i);
const categories = ["ORDER", "DELIVERY", "RETURN", "PAYMENT", "PRODUCT", "OTHER"] as const;

function files(formData: FormData): File[] {
  return formData.getAll("files").filter((f): f is File => f instanceof File);
}

export async function createTicketAction(
  _prev: TicketFormState,
  formData: FormData,
): Promise<TicketFormState> {
  const user = await requireUser();
  const values = {
    subject: String(formData.get("subject") ?? ""),
    body: String(formData.get("body") ?? ""),
    category: String(formData.get("category") ?? "OTHER"),
    orderId: String(formData.get("orderId") ?? ""),
  };
  const category = z.enum(categories).safeParse(values.category);
  const orderId = values.orderId ? id.safeParse(values.orderId) : null;
  if (!category.success || (orderId && !orderId.success))
    return { error: "Something was wrong with that request.", values };
  if (!rateLimit(`ticket:${user.id}`, 5, 60 * 60_000).ok)
    return { error: "You've opened several requests recently. Please wait an hour.", values };
  let ticketId: string;
  try {
    ticketId = await createTicket(user.id, {
      subject: values.subject,
      body: values.body,
      category: category.data,
      orderId: orderId?.success ? orderId.data : undefined,
      files: await readAttachments(files(formData)),
    });
  } catch (error) {
    if (error instanceof SupportError) return { error: error.message, values };
    throw error;
  }
  revalidatePath("/account/support");
  redirect(`/account/support/${ticketId}?created=1`);
}

export async function replyTicketAction(
  _prev: TicketFormState,
  formData: FormData,
): Promise<TicketFormState> {
  const user = await requireUser();
  const ticketId = id.safeParse(formData.get("ticketId"));
  const body = String(formData.get("body") ?? "");
  if (!ticketId.success) return { error: "Ticket not found." };
  if (!rateLimit(`ticket-reply:${user.id}`, 30, 60 * 60_000).ok)
    return { error: "Too many messages. Please wait a while.", values: { body } };
  try {
    await customerReply(user.id, ticketId.data, body, await readAttachments(files(formData)));
  } catch (error) {
    if (error instanceof SupportError) return { error: error.message, values: { body } };
    throw error;
  }
  revalidatePath(`/account/support/${ticketId.data}`);
  return {};
}

export async function resolveTicketAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const ticketId = id.safeParse(formData.get("ticketId"));
  if (!ticketId.success) return;
  await customerResolve(user.id, ticketId.data);
  revalidatePath(`/account/support/${ticketId.data}`);
}
