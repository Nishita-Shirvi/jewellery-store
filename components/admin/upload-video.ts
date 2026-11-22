"use client";

import { videoUploadTicketAction } from "@/app/admin/appearance-actions";

/**
 * Sends an MP4/WebM straight from the browser to our Cloudinary account with a signed ticket
 * (videos are too big to pass through our server). Shared by the theme hero and the sign-in page.
 */
export async function uploadVideo(
  file: File,
  maxVideoMb: number,
  onProgress: (percent: number) => void,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (!/^video\/(mp4|webm)$/.test(file.type) && !/\.(mp4|webm)$/i.test(file.name))
    return { ok: false, error: "Choose an MP4 or WebM video." };
  const failed = { ok: false as const, error: "The video didn't upload. Please try again." };
  try {
    const ticket = await videoUploadTicketAction();
    if (!ticket.ok) return { ok: false, error: ticket.error };
    if (file.size > ticket.maxBytes)
      return { ok: false, error: `Videos must be ${maxVideoMb} MB or smaller.` };
    const fd = new FormData();
    for (const [k, v] of Object.entries(ticket.fields)) fd.append(k, v);
    fd.append("file", file);
    const url = await new Promise<string | null>((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", ticket.url);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        try {
          const json = JSON.parse(xhr.responseText) as { secure_url?: string };
          resolve(xhr.status < 300 && json.secure_url ? json.secure_url : null);
        } catch {
          resolve(null);
        }
      };
      xhr.onerror = () => resolve(null);
      xhr.send(fd);
    });
    return url ? { ok: true, url } : failed;
  } catch {
    return failed;
  }
}
