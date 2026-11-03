import { Button } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/admin/confirm-submit";
import { InviteForm } from "@/components/admin/invite-form";
import { requirePermissionPage } from "@/lib/auth-guards";
import { ALL_PERMISSIONS, PERMISSIONS } from "@/lib/permissions";
import { listOpenInvites, listRoles, listStaff } from "@/services/staff.service";
import {
  deactivateStaffAction,
  reactivateStaffAction,
  resetStaffTwoFactorAction,
  revokeInviteAction,
  setStaffRolesAction,
} from "../actions";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" });

export default async function AdminStaffPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const me = await requirePermissionPage("staff.manage", "/admin/staff");
  const { error } = await searchParams;
  const [staff, roles, invites] = await Promise.all([listStaff(), listRoles(), listOpenInvites()]);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Staff</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Everyone here signs in with their own account and an authenticator app. Changes apply
          immediately. The store always keeps at least one active owner.
        </p>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {error.slice(0, 200)}
        </p>
      )}

      <section aria-labelledby="invite-h" className="space-y-3">
        <h2 id="invite-h" className="text-lg font-medium">
          Invite someone
        </h2>
        <InviteForm roles={roles.map((r) => ({ key: r.key, name: r.name }))} />
        {invites.length > 0 && (
          <ul className="divide-border border-border divide-y rounded-md border text-sm">
            {invites.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <span>
                  {i.email} · {i.role.name} · until {dateFmt.format(i.expiresAt)}
                </span>
                <form action={revokeInviteAction}>
                  <input type="hidden" name="inviteId" value={i.id} />
                  <Button type="submit" variant="ghost" size="sm">
                    Cancel invitation
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="team-h" className="space-y-3">
        <h2 id="team-h" className="text-lg font-medium">
          Team
        </h2>
        <ul className="divide-border border-border divide-y rounded-md border">
          {staff.map((s) => {
            const has = new Set(s.staffRoles.map((r) => r.role.key));
            const active = !s.staffDeactivatedAt;
            return (
              <li key={s.id} className="space-y-3 p-4 text-sm" data-testid="staff-row">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span>
                    <span className="font-medium">{s.name ?? s.email}</span>{" "}
                    <span className="text-muted-foreground">{s.email}</span>
                    {s.id === me.id && <span className="text-muted-foreground"> (you)</span>}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {active
                      ? "Active"
                      : `Deactivated ${dateFmt.format(s.staffDeactivatedAt ?? new Date())}`}{" "}
                    · two-step sign-in {s.totpEnabledAt ? "on" : "not set up yet"}
                  </span>
                </div>
                {active && (
                  <form action={setStaffRolesAction} className="flex flex-wrap items-center gap-3">
                    <input type="hidden" name="userId" value={s.id} />
                    {roles.map((r) => (
                      <label key={r.key} className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          name="roles"
                          value={r.key}
                          defaultChecked={has.has(r.key)}
                        />
                        {r.name}
                      </label>
                    ))}
                    <Button type="submit" size="sm" variant="outline">
                      Save roles
                    </Button>
                  </form>
                )}
                <div className="flex flex-wrap gap-2">
                  {active && s.id !== me.id && (
                    <form action={deactivateStaffAction}>
                      <input type="hidden" name="userId" value={s.id} />
                      <ConfirmSubmit
                        label="Deactivate"
                        title={`Deactivate ${s.email}?`}
                        description="They lose admin access at once. Their customer account and orders stay."
                        confirmLabel="Deactivate"
                      />
                    </form>
                  )}
                  {!active && (
                    <form action={reactivateStaffAction}>
                      <input type="hidden" name="userId" value={s.id} />
                      <Button type="submit" size="sm" variant="outline">
                        Reactivate
                      </Button>
                    </form>
                  )}
                  {active && s.totpEnabledAt && (
                    <form action={resetStaffTwoFactorAction}>
                      <input type="hidden" name="userId" value={s.id} />
                      <ConfirmSubmit
                        label="Reset two-step sign-in"
                        title="Reset two-step sign-in?"
                        description="For a lost phone. They are signed out of the admin and set it up again next time."
                        confirmLabel="Reset"
                      />
                    </form>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="matrix-h" className="space-y-3">
        <h2 id="matrix-h" className="text-lg font-medium">
          What each role can do
        </h2>
        <div className="border-border overflow-x-auto rounded-md border">
          <table className="w-full text-xs">
            <thead className="bg-muted text-left">
              <tr>
                <th className="p-2">Permission</th>
                {roles.map((r) => (
                  <th key={r.key} className="p-2">
                    {r.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {ALL_PERMISSIONS.map((p) => (
                <tr key={p}>
                  <td className="p-2">{PERMISSIONS[p]}</td>
                  {roles.map((r) => (
                    <td key={r.key} className="p-2 text-center">
                      {r.permissions.some((x) => x.permissionKey === p) ? "✓" : ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
