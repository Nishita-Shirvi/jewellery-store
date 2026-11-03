import type { Metadata } from "next";
import { ActionButton } from "@/components/marketing/marketing-forms";

export const metadata: Metadata = { title: "Confirm subscription", robots: { index: false } };

export default async function ConfirmNewsletterPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = "" } = await searchParams;
  return (
    <div className="mx-auto max-w-md space-y-4 px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">Confirm your subscription</h1>
      <p className="text-muted-foreground text-sm">
        Press the button to start receiving news about new collections and offers.
      </p>
      <ActionButton label="Yes, subscribe me" action={{ kind: "confirm", token }} />
    </div>
  );
}
