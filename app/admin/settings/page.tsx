import { requirePermissionPage } from "@/lib/auth-guards";
import { StorefrontSettingsForm } from "@/components/admin/storefront-settings-form";
import { config } from "@/lib/config";
import { getStorefrontSettings } from "@/services/storefront.service";

export const dynamic = "force-dynamic";

const onOff = (v: boolean) => (v ? "On" : "Off");

export default async function AdminSettingsPage() {
  await requirePermissionPage("content.manage", "/admin/settings");
  const settings = await getStorefrontSettings();
  const f = config.features;
  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Showroom settings</h1>
        <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
          Shown on the contact page, the visit-booking page, the footer and the WhatsApp button.
          Changes appear on the website straight away.
        </p>
      </div>
      <StorefrontSettingsForm values={settings} />

      <section className="border-border max-w-2xl rounded-md border p-4 text-sm">
        <h2 className="font-semibold">Set by the developer (config folder)</h2>
        <p className="text-muted-foreground mt-1 text-xs">
          These need a redeploy to change. Legal and GST details are in config/business.ini;
          switches in config/features.ini.
        </p>
        <dl className="mt-3 grid grid-cols-[200px_1fr] gap-y-1">
          <dt className="text-muted-foreground">Visit booking</dt>
          <dd>{onOff(f.visit_booking)}</dd>
          <dt className="text-muted-foreground">WhatsApp button</dt>
          <dd>{onOff(f.whatsapp_button)}</dd>
          <dt className="text-muted-foreground">Gold-rate bar</dt>
          <dd>{onOff(f.rate_strip)}</dd>
          <dt className="text-muted-foreground">Style advisor</dt>
          <dd>{onOff(f.style_advisor)}</dd>
          <dt className="text-muted-foreground">Image storage</dt>
          <dd>{config.images.provider}</dd>
          <dt className="text-muted-foreground">Return window</dt>
          <dd>{config.returns.window_days} days</dd>
          <dt className="text-muted-foreground">Shipping</dt>
          <dd>
            ₹{config.shipping.fee_rupees}, free above ₹{config.shipping.free_above_rupees}
          </dd>
        </dl>
      </section>
    </div>
  );
}
