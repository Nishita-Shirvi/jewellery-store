import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { formatRate } from "@/lib/gst";
import type { InvoiceSnapshot } from "@/services/invoice.service";

// The built-in PDF font has no ₹ glyph, so amounts use "Rs." (standard on Indian invoices).
const rs = (paise: number) =>
  `Rs. ${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const s = StyleSheet.create({
  page: { padding: 32, fontSize: 9, fontFamily: "Helvetica", color: "#222" },
  h1: { fontSize: 16, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  row: { flexDirection: "row" },
  box: { flex: 1, borderWidth: 1, borderColor: "#ccc", padding: 8 },
  label: { color: "#666", marginBottom: 2 },
  bold: { fontFamily: "Helvetica-Bold" },
  th: {
    fontFamily: "Helvetica-Bold",
    backgroundColor: "#f2f2f2",
    paddingVertical: 4,
    paddingHorizontal: 3,
  },
  td: { paddingVertical: 4, paddingHorizontal: 3, borderBottomWidth: 0.5, borderColor: "#ddd" },
  right: { textAlign: "right" },
});

const COLS = { name: 3.2, hsn: 0.9, qty: 0.5, rate: 0.6, taxable: 1.3, tax: 1.2, total: 1.3 };

function Cell({
  w,
  children,
  header,
  right,
}: {
  w: number;
  children: React.ReactNode;
  header?: boolean;
  right?: boolean;
}) {
  return <Text style={[header ? s.th : s.td, { flex: w }, right ? s.right : {}]}>{children}</Text>;
}

function InvoiceDocument({ inv }: { inv: InvoiceSnapshot }) {
  const date = new Date(inv.date).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
  return (
    <Document title={`Tax invoice ${inv.number}`} author={inv.seller.name}>
      <Page size="A4" style={s.page}>
        <View style={[s.row, { justifyContent: "space-between", marginBottom: 12 }]}>
          <View>
            <Text style={s.h1}>TAX INVOICE</Text>
            <Text>
              Invoice no: <Text style={s.bold}>{inv.number}</Text>
            </Text>
            <Text>Invoice date: {date}</Text>
            <Text>Order: {inv.orderNumber}</Text>
          </View>
          <View style={{ maxWidth: 230 }}>
            <Text style={s.bold}>{inv.seller.name}</Text>
            <Text>{inv.seller.address}</Text>
            <Text>GSTIN: {inv.seller.gstin}</Text>
            <Text>State: {inv.seller.state}</Text>
            <Text>
              {inv.seller.email} · {inv.seller.phone}
            </Text>
          </View>
        </View>

        <View style={[s.row, { gap: 8, marginBottom: 12 }]}>
          <View style={s.box}>
            <Text style={s.label}>Bill to / Ship to</Text>
            <Text style={s.bold}>{inv.buyer.name}</Text>
            <Text>{inv.buyer.address}</Text>
            <Text>
              {inv.buyer.phone} · {inv.buyer.email}
            </Text>
          </View>
          <View style={s.box}>
            <Text style={s.label}>Place of supply</Text>
            <Text style={s.bold}>{inv.placeOfSupply}</Text>
            <Text style={[s.label, { marginTop: 6 }]}>Tax type</Text>
            <Text>{inv.intraState ? "Intra-state: CGST + SGST" : "Inter-state: IGST"}</Text>
          </View>
        </View>

        <View style={s.row}>
          <Cell w={COLS.name} header>
            Description
          </Cell>
          <Cell w={COLS.hsn} header>
            HSN/SAC
          </Cell>
          <Cell w={COLS.qty} header right>
            Qty
          </Cell>
          <Cell w={COLS.rate} header right>
            GST
          </Cell>
          <Cell w={COLS.taxable} header right>
            Taxable value
          </Cell>
          <Cell w={COLS.tax} header right>
            {inv.intraState ? "CGST + SGST" : "IGST"}
          </Cell>
          <Cell w={COLS.total} header right>
            Total
          </Cell>
        </View>
        {inv.lines.map((l, i) => (
          <View key={i} style={s.row} wrap={false}>
            <Cell w={COLS.name}>{l.name}</Cell>
            <Cell w={COLS.hsn}>{l.hsn}</Cell>
            <Cell w={COLS.qty} right>
              {l.quantity}
            </Cell>
            <Cell w={COLS.rate} right>
              {formatRate(l.rateBps)}
            </Cell>
            <Cell w={COLS.taxable} right>
              {rs(l.taxableInPaise)}
            </Cell>
            <Cell w={COLS.tax} right>
              {inv.intraState ? `${rs(l.cgstInPaise)} + ${rs(l.sgstInPaise)}` : rs(l.igstInPaise)}
            </Cell>
            <Cell w={COLS.total} right>
              {rs(l.totalInPaise)}
            </Cell>
          </View>
        ))}

        <View style={{ alignSelf: "flex-end", width: 240, marginTop: 10 }}>
          {[
            ["Taxable value", inv.totals.taxableInPaise],
            ...(inv.intraState
              ? [
                  ["CGST", inv.totals.cgstInPaise],
                  ["SGST", inv.totals.sgstInPaise],
                ]
              : [["IGST", inv.totals.igstInPaise]]),
          ].map(([k, v]) => (
            <View
              key={k as string}
              style={[s.row, { justifyContent: "space-between", paddingVertical: 2 }]}
            >
              <Text>{k}</Text>
              <Text>{rs(v as number)}</Text>
            </View>
          ))}
          <View
            style={[
              s.row,
              {
                justifyContent: "space-between",
                borderTopWidth: 1,
                borderColor: "#222",
                paddingTop: 4,
                marginTop: 2,
              },
            ]}
          >
            <Text style={s.bold}>Invoice total</Text>
            <Text style={s.bold}>{rs(inv.totals.totalInPaise)}</Text>
          </View>
        </View>
        <Text style={{ marginTop: 8 }}>Amount in words: {inv.amountInWords}</Text>
        {inv.coupon && (
          <Text style={{ marginTop: 4 }}>
            Coupon {inv.coupon.code} applied: {rs(inv.coupon.discountInPaise)} off. Item values
            above are after the discount.
          </Text>
        )}
        <Text style={{ marginTop: 24, color: "#666" }}>
          Prices are inclusive of GST. This is a computer-generated invoice and does not need a
          signature.
        </Text>
      </Page>
    </Document>
  );
}

export async function renderInvoicePdf(inv: InvoiceSnapshot): Promise<Buffer> {
  return renderToBuffer(<InvoiceDocument inv={inv} />);
}
