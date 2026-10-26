import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-guards";
import { renderInvoicePdf } from "@/lib/invoice/invoice-pdf";
import { logger } from "@/lib/logger";
import { getUserRole } from "@/services/auth.service";
import { getInvoiceForViewer } from "@/services/invoice.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/invoices/<orderId> — the order's owner or an admin downloads the tax invoice PDF. */
export async function GET(_request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Please log in." }, { status: 401 });
  const { orderId } = await params;
  if (!/^[a-z0-9]{1,40}$/i.test(orderId))
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isAdmin = (await getUserRole(user.id)) === "ADMIN";
  const invoice = await getInvoiceForViewer(orderId, { id: user.id, isAdmin });
  // Same 404 whether it doesn't exist or belongs to someone else (don't reveal which).
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const pdf = await renderInvoicePdf(invoice.snapshot);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="invoice-${invoice.number.replaceAll("/", "-")}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    logger.error("invoice.render_failed", { orderId, error });
    return NextResponse.json({ error: "Couldn't create the PDF." }, { status: 500 });
  }
}
