import { AppearanceTabs } from "@/components/admin/appearance-tabs";
import { EntranceEditor } from "@/components/admin/entrance-editor";
import { requirePermissionPage } from "@/lib/auth-guards";
import { config } from "@/lib/config";
import { loadEntrance } from "@/services/entrance.service";
import { isUploadConfigured } from "@/services/upload.service";

export const dynamic = "force-dynamic";

export default async function AdminSignInLookPage() {
  await requirePermissionPage("content.manage", "/admin/appearance/sign-in");
  const entrance = await loadEntrance();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Appearance</h1>
        <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
          The background video on the log-in and create-account pages, and the slim tagline bar
          above the header on shop pages.
        </p>
      </div>
      <AppearanceTabs current="entrance" />
      <EntranceEditor
        initial={entrance}
        imageUpload={isUploadConfigured()}
        videoUpload={config.images.provider === "cloudinary" && isUploadConfigured()}
        maxVideoMb={config.images.max_video_mb}
      />
    </div>
  );
}
