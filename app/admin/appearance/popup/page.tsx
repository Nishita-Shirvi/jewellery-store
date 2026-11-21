import { AppearanceTabs } from "@/components/admin/appearance-tabs";
import { PopupEditor } from "@/components/admin/popup-editor";
import { requirePermissionPage } from "@/lib/auth-guards";
import { todayInIndia } from "@/lib/appearance";
import { config } from "@/lib/config";
import { publicEnv } from "@/lib/env";
import { visitDays } from "@/lib/popup";
import { loadPopup } from "@/services/popup.service";
import { isUploadConfigured } from "@/services/upload.service";

export const dynamic = "force-dynamic";

export default async function AdminPopupPage() {
  await requirePermissionPage("content.manage", "/admin/appearance/popup");
  const popup = await loadPopup();
  const today = todayInIndia();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Appearance</h1>
        <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
          A popup with a picture, a few words and one thing to do: book a private viewing, join the
          newsletter, sign in, or open a page. It&apos;s off until you switch it on.
        </p>
      </div>
      <AppearanceTabs current="popup" />
      <PopupEditor
        initial={popup}
        today={today}
        siteName={publicEnv.NEXT_PUBLIC_SITE_NAME}
        days={visitDays(today)}
        imageUpload={isUploadConfigured()}
        visitBooking={config.features.visit_booking}
      />
    </div>
  );
}
