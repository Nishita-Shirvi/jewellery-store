import { NextResponse } from "next/server";
import { getCurrentUser, staffHasPermission } from "@/lib/auth-guards";
import { getAttachmentForViewer } from "@/services/support.service";
import { withRequestId } from "@/lib/request-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/support/attachments/<id> — a support attachment, only for the ticket's customer
 * (not on internal notes) or support staff who passed two-step sign-in. Same 404 for "not
 * found" and "not yours". Served so it can never run as a page: exact type from the bytes,
 * nosniff, a sandboxing CSP, private no-store caching.
 */
async function handleGET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Please log in." }, { status: 401 });
  const { id } = await params;
  if (!/^[a-z0-9]{1,40}$/i.test(id))
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isSupportStaff = await staffHasPermission(user.id, "support.manage");
  const file = await getAttachmentForViewer(id, { id: user.id, isSupportStaff });
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const disposition = file.contentType === "application/pdf" ? "attachment" : "inline";
  return new NextResponse(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Length": String(file.size),
      "Content-Disposition": `${disposition}; filename="${file.filename}"`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; sandbox",
      "Cache-Control": "private, no-store",
    },
  });
}

/** Phase 26: every log line of this request shares one id (also sent as x-request-id). */
export const GET = withRequestId(handleGET);
