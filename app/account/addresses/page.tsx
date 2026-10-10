import type { Metadata } from "next";
import { ConfirmSubmit } from "@/components/admin/confirm-submit";
import { AddressEditor } from "@/components/account/address-editor";
import { Button } from "@/components/ui/button";
import { requireUserPage } from "@/lib/auth-guards";
import { listAddresses } from "@/services/address.service";
import { deleteAddressAction, setDefaultAddressAction } from "../actions";

export const metadata: Metadata = { title: "Addresses", robots: { index: false } };

export default async function AddressesPage() {
  const user = await requireUserPage("/account/addresses");
  const addresses = await listAddresses(user.id);

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Addresses</h1>
      <AddressEditor triggerLabel="Add a new address" />
      {addresses.length === 0 ? (
        <p className="text-muted-foreground text-sm">No saved addresses yet.</p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {addresses.map((a) => (
            <li key={a.id} className="border-border space-y-3 rounded-md border p-4 text-sm">
              <p>
                <span className="font-medium">{a.fullName}</span> · {a.phone}
                {a.isDefault && (
                  <span className="border-border ml-2 rounded border px-1.5 py-0.5 text-xs">
                    Default
                  </span>
                )}
              </p>
              <p className="text-muted-foreground">
                {[a.line1, a.line2, a.landmark].filter(Boolean).join(", ")}
                <br />
                {a.city}, {a.state} {a.pincode}
              </p>
              <div className="flex flex-wrap items-start gap-2">
                <AddressEditor
                  triggerLabel="Edit"
                  address={{
                    id: a.id,
                    fullName: a.fullName,
                    phone: a.phone,
                    line1: a.line1,
                    line2: a.line2 ?? "",
                    landmark: a.landmark ?? "",
                    city: a.city,
                    state: a.state,
                    pincode: a.pincode,
                  }}
                />
                {!a.isDefault && (
                  <form action={setDefaultAddressAction}>
                    <input type="hidden" name="id" value={a.id} />
                    <Button type="submit" variant="ghost" size="sm">
                      Make default
                    </Button>
                  </form>
                )}
                <form action={deleteAddressAction}>
                  <input type="hidden" name="id" value={a.id} />
                  <ConfirmSubmit
                    label="Delete"
                    variant="ghost"
                    title="Delete this address?"
                    description="Past orders keep their own copy of the address."
                    confirmLabel="Delete address"
                  />
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
