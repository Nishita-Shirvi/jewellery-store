"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth-guards";
import { config } from "@/lib/config";
import { env } from "@/lib/env";
import { makePreviewToken } from "@/lib/preview";
import type { Appearance, Theme } from "@/lib/appearance";
import { COLOR_MODES, type ColorMode } from "@/lib/theme";
import { themeSchema } from "@/lib/validation/appearance";
import { loadAppearance, saveAppearance } from "@/services/appearance.service";
import { audit } from "@/services/audit.service";
import { UploadError, isUploadConfigured, uploadImage } from "@/services/upload.service";

/** Admin → Appearance. Every action re-checks the "content.manage" permission on the server. */

export type ThemeSaveResult =
  | {
      ok: true;
      appearance: Appearance;
      savedId: string;
      /** Signed 48-hour links to preview each theme on the home page. */
      previewTokens: Record<string, string>;
    }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

function previewTokens(appearance: Appearance): Record<string, string> {
  return Object.fromEntries(appearance.themes.map((t) => [t.id, makePreviewToken("theme", t.id)]));
}

function slug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 28);
  return `${base || "theme"}-${randomBytes(3).toString("hex")}`;
}

export async function saveThemeAction(input: unknown): Promise<ThemeSaveResult> {
  const admin = await requirePermission("content.manage");
  const current = await loadAppearance();
  const raw = (input ?? {}) as Partial<Theme>;
  const existing = current.themes.find((t) => t.id === raw.id);
  // Whether a theme is the always-on one is never up to the browser.
  const candidate = {
    ...raw,
    id: existing ? existing.id : slug(String(raw.name ?? "")),
    isDefault: existing?.isDefault ?? false,
    ...(existing?.isDefault ? { from: "", until: "" } : {}),
  };
  const parsed = themeSchema.safeParse(candidate);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".");
      fieldErrors[key] ??= issue.message;
    }
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors };
  }
  const theme = parsed.data as Theme;
  const themes = existing
    ? current.themes.map((t) => (t.id === theme.id ? theme : t))
    : [...current.themes, theme];
  if (themes.length > 30) return { ok: false, error: "Delete an old theme first (30 at most)." };
  const next: Appearance = { ...current, themes };
  await saveAppearance(next);
  await audit(admin, {
    action: "settings.appearance",
    entityType: "settings",
    entityId: theme.id,
    summary: `${existing ? "Updated" : "Added"} theme "${theme.name}"${theme.isDefault ? "" : ` (${theme.from} to ${theme.until})`}`,
  });
  revalidatePath("/", "layout");
  return { ok: true, appearance: next, savedId: theme.id, previewTokens: previewTokens(next) };
}

export async function deleteThemeAction(id: string): Promise<ThemeSaveResult> {
  const admin = await requirePermission("content.manage");
  const current = await loadAppearance();
  const theme = current.themes.find((t) => t.id === id);
  if (!theme) return { ok: false, error: "That theme was already deleted." };
  if (theme.isDefault) return { ok: false, error: "The Everyday theme can't be deleted." };
  const next: Appearance = { ...current, themes: current.themes.filter((t) => t.id !== id) };
  await saveAppearance(next);
  await audit(admin, {
    action: "settings.appearance",
    entityType: "settings",
    entityId: id,
    summary: `Deleted theme "${theme.name}"`,
  });
  revalidatePath("/", "layout");
  return {
    ok: true,
    appearance: next,
    savedId: next.themes.find((t) => t.isDefault)!.id,
    previewTokens: previewTokens(next),
  };
}

export async function saveDefaultModeAction(
  mode: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = await requirePermission("content.manage");
  if (!COLOR_MODES.includes(mode as ColorMode)) return { ok: false, error: "Choose a mode." };
  const current = await loadAppearance();
  await saveAppearance({ ...current, defaultMode: mode as ColorMode });
  await audit(admin, {
    action: "settings.appearance",
    entityType: "settings",
    entityId: "default-mode",
    summary: `Light/dark for new visitors: ${mode}`,
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Theme photos (the arch photo, and the still shown before a video). */
export async function uploadAppearanceImageAction(
  formData: FormData,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const admin = await requirePermission("content.manage");
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Choose an image file." };
  try {
    const url = await uploadImage(file, "jewellery-store/appearance");
    await audit(admin, {
      action: "settings.appearance_upload",
      entityType: "settings",
      entityId: "appearance",
      summary: `Uploaded a theme photo (${file.name.slice(0, 80)})`,
    });
    return { ok: true, url };
  } catch (error) {
    return { ok: false, error: error instanceof UploadError ? error.message : "Upload failed." };
  }
}

export type VideoUploadTicket =
  | {
      ok: true;
      url: string;
      fields: Record<string, string>;
      maxBytes: number;
    }
  | { ok: false; error: string };

/**
 * Videos are too big to pass through our server, so the browser sends them straight to our
 * Cloudinary account with a signed, short-lived ticket: only into the appearance folder and only
 * MP4 or WebM. Saving a theme still checks the resulting link is on our account.
 */
export async function videoUploadTicketAction(): Promise<VideoUploadTicket> {
  await requirePermission("content.manage");
  if (config.images.provider !== "cloudinary" || !isUploadConfigured())
    return {
      ok: false,
      error: "Video upload needs Cloudinary. Paste a link to a video on our storage instead.",
    };
  const params: Record<string, string> = {
    allowed_formats: "mp4,webm",
    folder: "jewellery-store/appearance",
    timestamp: String(Math.floor(Date.now() / 1000)),
  };
  const toSign = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  const signature = createHash("sha1")
    .update(toSign + env.CLOUDINARY_API_SECRET)
    .digest("hex");
  return {
    ok: true,
    url: `${env.CLOUDINARY_API_BASE}/v1_1/${env.CLOUDINARY_CLOUD_NAME}/video/upload`,
    fields: { ...params, api_key: env.CLOUDINARY_API_KEY ?? "", signature },
    maxBytes: config.images.max_video_mb * 1024 * 1024,
  };
}
