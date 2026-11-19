"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { inviteStaffAction, type AdminFormState } from "@/app/admin/actions";

export function InviteForm({ roles }: { roles: { key: string; name: string }[] }) {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(inviteStaffAction, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-3" aria-label="Invite staff">
      <div className="space-y-1.5">
        <Label htmlFor="invite-email">Email</Label>
        <Input
          id="invite-email"
          name="email"
          type="email"
          required
          className="w-64"
          defaultValue={state.values?.email}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="invite-role">Role</Label>
        <select
          id="invite-role"
          name="role"
          defaultValue={state.values?.role ?? "SUPPORT"}
          className="border-input bg-background h-9 rounded-md border px-2 text-sm"
        >
          {roles.map((r) => (
            <option key={r.key} value={r.key}>
              {r.name}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" disabled={pending}>
        Send invitation
      </Button>
      {(state.error || state.message) && (
        <p
          role={state.error ? "alert" : "status"}
          className={`w-full text-sm break-all ${state.error ? "text-red-700" : "text-emerald-700"}`}
          data-testid="invite-result"
        >
          {state.error ?? state.message}
        </p>
      )}
    </form>
  );
}
