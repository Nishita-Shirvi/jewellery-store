import { ImageResponse } from "next/og";
import { formatINR } from "@/lib/format";
import { publicEnv } from "@/lib/env";
import { getProductBySlug } from "@/services/catalog.service";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Product";

/** Share image for WhatsApp/Facebook/X: brand colours, product name, metal and price. */
export default async function OpengraphImage({ params }: { params: Promise<{ slug: string }> }) {
  const product = await getProductBySlug((await params).slug);
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "#4a1528",
        color: "#fbf7f4",
        padding: 72,
        fontFamily: "serif",
      }}
    >
      <div style={{ fontSize: 34, letterSpacing: 2, color: "#e9cfa0" }}>
        {publicEnv.NEXT_PUBLIC_SITE_NAME}
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: 76, lineHeight: 1.05 }}>{product?.name ?? "Fine jewellery"}</div>
        {product && (
          <div style={{ fontSize: 34, marginTop: 20, color: "#ead9dd" }}>
            {product.materialSummary}
          </div>
        )}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div style={{ fontSize: 52 }}>
          {product ? formatINR(product.priceInPaise).replace("₹", "Rs. ") : ""}
        </div>
        <div style={{ fontSize: 26, color: "#e9cfa0" }}>BIS hallmarked · Insured delivery</div>
      </div>
    </div>,
    size,
  );
}
