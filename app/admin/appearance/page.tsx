import { AppearanceEditor } from "@/components/admin/appearance-editor";
import { requirePermissionPage } from "@/lib/auth-guards";
import { liveTheme, todayInIndia } from "@/lib/appearance";
import { config } from "@/lib/config";
import { makePreviewToken } from "@/lib/preview";
import { AppearanceReadError, loadAppearance } from "@/services/appearance.service";
import { festivalPresets } from "@/services/merch.service";
import { isUploadConfigured } from "@/services/upload.service";

export const dynamic = "force-dynamic";

export default async function AdminAppearancePage() {
  await requirePermissionPage("content.manage", "/admin/appearance");
  let appearance;
  try {
    appearance = await loadAppearance();
  } catch (error) {
    if (!(error instanceof AppearanceReadError)) throw error;
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Appearance</h1>
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {error.message} The shop shows the built-in Everyday look until then.
        </p>
      </div>
    );
  }
  const today = todayInIndia();
  const previewTokens = Object.fromEntries(
    appearance.themes.map((t) => [t.id, makePreviewToken("theme", t.id)]),
  );
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Appearance</h1>
        <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
          Colours, festive decoration and the top of the home page. The shop shows the festival
          theme that is live today; when none is, it shows Everyday. Themes switch on and off by
          themselves on their dates (India time) — no deploy needed. Admin pages don&apos;t change.
        </p>
      </div>
      <AppearanceEditor
        initial={appearance}
        initialSelected={liveTheme(appearance, today).id}
        today={today}
        previewTokens={previewTokens}
        festivals={festivalPresets()}
        imageUpload={isUploadConfigured()}
        videoUpload={config.images.provider === "cloudinary" && isUploadConfigured()}
        maxVideoMb={config.images.max_video_mb}
      />
    </div>
  );
}
