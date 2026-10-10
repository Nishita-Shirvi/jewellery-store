"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { requestReturnAction, uploadReturnPhotoAction } from "@/app/account/orders/actions";
import { formatINR } from "@/lib/format";
import { RETURN_REASON_LABEL } from "@/lib/returns";

interface Item {
  orderItemId: string;
  name: string;
  priceInPaise: number;
  returnable: boolean;
  remaining: number;
}

export function ReturnForm({
  orderId,
  items,
  uploadEnabled,
}: {
  orderId: string;
  items: Item[];
  uploadEnabled: boolean;
}) {
  const router = useRouter();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const selected = Object.entries(qty)
    .filter(([, q]) => q > 0)
    .map(([orderItemId, quantity]) => ({ orderItemId, quantity }));
  const estimate = selected.reduce(
    (sum, s) =>
      sum + (items.find((i) => i.orderItemId === s.orderItemId)?.priceInPaise ?? 0) * s.quantity,
    0,
  );

  function submit() {
    setError(null);
    start(async () => {
      const res = await requestReturnAction({
        orderId,
        reason,
        details,
        photoUrl,
        items: selected,
      });
      if (res.ok) router.push(`/account/orders/${orderId}?returned=1`);
      else setError(res.error);
    });
  }

  function upload(file: File) {
    const data = new FormData();
    data.append("file", file);
    start(async () => {
      const res = await uploadReturnPhotoAction(data);
      if (res.ok) setPhotoUrl(res.url);
      else setError(res.error);
    });
  }

  return (
    <div className="space-y-6">
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Which pieces are you returning?</legend>
        {items.map((item) => (
          <div
            key={item.orderItemId}
            className="border-border flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm"
          >
            <span>
              {item.name} · {formatINR(item.priceInPaise)}
              {!item.returnable && (
                <span className="text-muted-foreground block text-xs">Not returnable</span>
              )}
              {item.returnable && item.remaining === 0 && (
                <span className="text-muted-foreground block text-xs">Already returned</span>
              )}
            </span>
            {item.returnable && item.remaining > 0 && (
              <select
                aria-label={`Quantity of ${item.name} to return`}
                className="border-input bg-background h-9 rounded-md border px-2"
                value={qty[item.orderItemId] ?? 0}
                onChange={(e) => setQty({ ...qty, [item.orderItemId]: Number(e.target.value) })}
              >
                {Array.from({ length: item.remaining + 1 }, (_, n) => (
                  <option key={n} value={n}>
                    {n === 0 ? "Don't return" : `Return ${n}`}
                  </option>
                ))}
              </select>
            )}
          </div>
        ))}
      </fieldset>

      <div className="space-y-1.5">
        <Label htmlFor="reason">Reason</Label>
        <select
          id="reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="border-input bg-background h-9 w-full max-w-sm rounded-md border px-2 text-sm"
        >
          <option value="" disabled>
            Choose a reason
          </option>
          {Object.entries(RETURN_REASON_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="details">Tell us more (optional)</Label>
        <textarea
          id="details"
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          maxLength={1000}
          rows={3}
          className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
        />
      </div>

      {uploadEnabled && (
        <div className="space-y-1.5">
          <Label htmlFor="photo">Photo (optional, helps with damaged items)</Label>
          <input
            id="photo"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="text-sm"
            onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
          />
          {photoUrl && <p className="text-xs text-emerald-700">Photo added.</p>}
        </div>
      )}

      {selected.length > 0 && (
        <p className="text-sm">
          Estimated refund: <strong>{formatINR(estimate)}</strong> (shipping is refunded too if the
          item was damaged or wrong).
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <Button type="button" onClick={submit} disabled={pending || selected.length === 0 || !reason}>
        {pending ? "Sending…" : "Request return"}
      </Button>
    </div>
  );
}
