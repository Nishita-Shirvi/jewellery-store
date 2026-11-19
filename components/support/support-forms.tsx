"use client";

import { useActionState, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createTicketAction,
  replyTicketAction,
  type TicketFormState,
} from "@/app/account/support/actions";
import { staffReplyTicketAction } from "@/app/admin/actions";
import { MAX_ATTACHMENTS, TICKET_CATEGORY_LABEL } from "@/lib/support";

const textarea =
  "border-input bg-background w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none";

function Files() {
  return (
    <div className="space-y-1.5">
      <Label htmlFor="ticket-files">
        Photos or PDF (optional, up to {MAX_ATTACHMENTS}, 2 MB each)
      </Label>
      <input
        id="ticket-files"
        name="files"
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="text-sm"
      />
    </div>
  );
}

function ErrorText({ state }: { state: TicketFormState }) {
  return state.error ? (
    <p role="alert" className="text-sm text-red-700">
      {state.error}
    </p>
  ) : null;
}

export function NewTicketForm({
  orders,
  orderId,
  category,
}: {
  orders: { id: string; label: string }[];
  orderId?: string;
  category?: string;
}) {
  const [state, action, pending] = useActionState<TicketFormState, FormData>(
    createTicketAction,
    {},
  );
  return (
    <form action={action} className="space-y-4" aria-label="New support request">
      <div className="space-y-1.5">
        <Label htmlFor="ticket-category">What is it about?</Label>
        <select
          id="ticket-category"
          name="category"
          defaultValue={state.values?.category ?? category ?? "OTHER"}
          className="border-input bg-background h-9 rounded-md border px-2 text-sm"
        >
          {Object.entries(TICKET_CATEGORY_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {orders.length > 0 && (
        <div className="space-y-1.5">
          <Label htmlFor="ticket-order">Order (optional)</Label>
          <select
            id="ticket-order"
            name="orderId"
            defaultValue={state.values?.orderId ?? orderId ?? ""}
            className="border-input bg-background h-9 rounded-md border px-2 text-sm"
          >
            <option value="">Not about an order</option>
            {orders.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="ticket-subject">Subject</Label>
        <Input
          id="ticket-subject"
          name="subject"
          maxLength={120}
          required
          defaultValue={state.values?.subject}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ticket-body">Your message</Label>
        <textarea
          id="ticket-body"
          name="body"
          rows={6}
          maxLength={5000}
          required
          className={textarea}
          defaultValue={state.values?.body}
        />
      </div>
      <Files />
      <ErrorText state={state} />
      <Button type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send"}
      </Button>
    </form>
  );
}

export function CustomerReplyForm({ ticketId }: { ticketId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<TicketFormState, FormData>(async (prev, fd) => {
    const res = await replyTicketAction(prev, fd);
    if (!res.error) formRef.current?.reset();
    return res;
  }, {});
  return (
    <form ref={formRef} action={action} className="space-y-3" aria-label="Reply">
      <input type="hidden" name="ticketId" value={ticketId} />
      <Label htmlFor="reply-body">Reply</Label>
      <textarea
        id="reply-body"
        name="body"
        rows={4}
        maxLength={5000}
        required
        className={textarea}
        defaultValue={state.values?.body}
      />
      <Files />
      <ErrorText state={state} />
      <Button type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send reply"}
      </Button>
    </form>
  );
}

export function StaffReplyForm({
  ticketId,
  canned,
}: {
  ticketId: string;
  canned: { id: string; title: string; body: string }[];
}) {
  const [body, setBody] = useState("");
  return (
    <form action={staffReplyTicketAction} className="space-y-3" aria-label="Staff reply">
      <input type="hidden" name="ticketId" value={ticketId} />
      {canned.length > 0 && (
        <div className="space-y-1.5">
          <Label htmlFor="canned">Insert a saved reply</Label>
          <select
            id="canned"
            defaultValue=""
            onChange={(e) => {
              const c = canned.find((x) => x.id === e.target.value);
              if (c) setBody((b) => (b ? `${b}\n\n${c.body}` : c.body));
              e.target.value = "";
            }}
            className="border-input bg-background h-9 rounded-md border px-2 text-sm"
          >
            <option value="">Choose…</option>
            {canned.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </div>
      )}
      <Label htmlFor="staff-body">Message</Label>
      <textarea
        id="staff-body"
        name="body"
        rows={6}
        maxLength={5000}
        required
        value={body}
        onChange={(e) => setBody(e.target.value)}
        className={textarea}
      />
      <Files />
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="internal" /> Internal note (not sent to the customer)
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="resolve" /> Mark as resolved
        </label>
      </div>
      <Button type="submit">Send</Button>
    </form>
  );
}
