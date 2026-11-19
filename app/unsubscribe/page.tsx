import type { Metadata } from "next";
import { ActionButton } from "@/components/marketing/marketing-forms";

export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false } };

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string; t?: string }>;
}) {
  const { e = "", t = "" } = await searchParams;
  return (
    <div className="mx-auto max-w-md space-y-4 px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">Unsubscribe</h1>
      <p className="text-muted-foreground text-sm">
        Stop newsletters and cart reminders. Emails about your orders will still arrive.
      </p>
      <ActionButton label="Unsubscribe me" action={{ kind: "unsubscribe", e, t }} />
    </div>
  );
}
