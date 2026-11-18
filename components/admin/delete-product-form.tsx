"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { deleteProductAction, type AdminFormState } from "@/app/admin/actions";

/** Permanent delete for pieces that were never ordered. Asks to type the name to confirm. */
export function DeleteProductForm({ id, name }: { id: string; name: string }) {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(
    deleteProductAction,
    {},
  );
  const [typed, setTyped] = useState("");
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <p className="text-sm">
        Deleting removes this piece for good. Only pieces that were never ordered can be deleted;
        otherwise hide it.
      </p>
      <label className="block space-y-1.5 text-sm">
        <span>
          Type <strong>{name}</strong> to confirm
        </span>
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          className="border-input bg-background h-9 w-full max-w-sm rounded-md border px-2 text-sm"
          autoComplete="off"
        />
      </label>
      {state.error && (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      )}
      <Button type="submit" variant="destructive" disabled={pending || typed.trim() !== name}>
        {pending ? "Deleting…" : "Delete product"}
      </Button>
    </form>
  );
}
