import Link from "next/link";
import { notFound } from "next/navigation";
import { OptionsForm, VariantsGrid } from "@/components/admin/variant-forms";
import { mgToGramsInput, paiseToRupeesInput } from "@/lib/money";
import { getVariantEditor } from "@/services/admin/variant-admin.service";
import { requirePermissionPage } from "@/lib/auth-guards";

export const dynamic = "force-dynamic";

export default async function ProductVariantsPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermissionPage("products.edit", "/admin/products");
  const { id } = await params;
  if (!/^[a-z0-9]{1,40}$/i.test(id)) notFound();
  const product = await getVariantEditor(id);
  if (!product) notFound();

  return (
    <div className="space-y-10">
      <div>
        <Link
          href={`/admin/products/${product.id}`}
          className="text-sm underline underline-offset-4"
        >
          ← Back to {product.name}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Variants: {product.name}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Each variant has its own SKU, price, stock and weight. The store shows the lowest price as
          the &ldquo;from&rdquo; price and the total stock of variants that are on sale.
        </p>
      </div>

      <section aria-labelledby="options-heading" className="space-y-4">
        <h2 id="options-heading" className="text-lg font-medium">
          Options
        </h2>
        <OptionsForm
          productId={product.id}
          options={product.options.map((o) => ({
            name: o.name,
            values: o.values.map((v) => v.value),
          }))}
        />
      </section>

      <section aria-labelledby="variants-heading" className="space-y-4">
        <h2 id="variants-heading" className="text-lg font-medium">
          Variants ({product.variants.filter((v) => v.isActive).length} on sale)
        </h2>
        <VariantsGrid
          productId={product.id}
          rows={product.variants.map((v) => ({
            id: v.id,
            sku: v.sku,
            label: v.label,
            price: paiseToRupeesInput(v.priceInPaise),
            compareAt: v.compareAtPriceInPaise ? paiseToRupeesInput(v.compareAtPriceInPaise) : "",
            stock: v.stock,
            reserved: v.reservedStock,
            net: mgToGramsInput(v.netWeightMg),
            gross: v.grossWeightMg ? mgToGramsInput(v.grossWeightMg) : "",
            isActive: v.isActive,
            orders: v._count.orderItems,
          }))}
        />
      </section>
    </div>
  );
}
