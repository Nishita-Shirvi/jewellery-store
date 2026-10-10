import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserPage } from "@/lib/auth-guards";
import { RETURN_WINDOW_DAYS } from "@/lib/returns";
import { getReturnOptions } from "@/services/return.service";
import { isUploadConfigured } from "@/services/upload.service";
import { ReturnForm } from "./return-form";

export const metadata: Metadata = { title: "Return items", robots: { index: false } };

const dateFmt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" });

export default async function ReturnPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUserPage(`/account/orders/${id}/return`);
  const options = await getReturnOptions(user.id, id);
  if (!options) notFound();

  return (
    <section className="max-w-2xl space-y-6">
      <Link
        href={`/account/orders/${id}`}
        className="text-muted-foreground text-sm hover:underline"
      >
        ← Back to order
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">Return items</h1>
      {options.eligibility.ok ? (
        <>
          <p className="text-muted-foreground text-sm">
            You can return eligible pieces within {RETURN_WINDOW_DAYS} days of delivery (until{" "}
            {dateFmt.format(options.eligibility.deadline)}). Pieces must be unused, with tags and
            certificates.
          </p>
          <ReturnForm orderId={id} items={options.items} uploadEnabled={isUploadConfigured()} />
        </>
      ) : (
        <p role="alert" className="border-border bg-muted rounded-md border p-4 text-sm">
          {options.eligibility.reason}
        </p>
      )}
    </section>
  );
}
