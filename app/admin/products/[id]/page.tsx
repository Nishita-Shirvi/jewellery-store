import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductForm } from "@/components/admin/product-form";
import { listCategoryOptions } from "@/services/admin/category-admin.service";
import { formatRate } from "@/lib/gst";
import { mgToGramsInput, paiseToRupeesInput } from "@/lib/money";
import { listPlaceholderImages } from "@/lib/placeholder-images";
import { getProductAdmin } from "@/services/admin/product-admin.service";
import { getCurrentRates } from "@/services/metal-rate.service";
import { isUploadConfigured } from "@/services/upload.service";
import { DeleteProductForm } from "@/components/admin/delete-product-form";
import { db } from "@/lib/db";

export default async function EditProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { id } = await params;
  const { created } = await searchParams;
  const [product, categories, placeholderImages, rates, orderCount] = await Promise.all([
    getProductAdmin(id),
    listCategoryOptions(),
    listPlaceholderImages(),
    getCurrentRates(),
    db.orderItem.count({ where: { productId: id } }),
  ]);
  if (!product) notFound();

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Edit: {product.name}</h1>
        {product.isActive && (
          <Link
            href={`/products/${product.slug}`}
            className="text-sm underline underline-offset-4"
            target="_blank"
          >
            View in store
          </Link>
        )}
      </div>
      {created && (
        <p
          role="status"
          className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          Product created.
        </p>
      )}
      <div className="mt-6">
        <ProductForm
          categories={categories}
          placeholderImages={placeholderImages}
          uploadEnabled={isUploadConfigured()}
          ratesAvailable={Object.keys(rates)}
          values={{
            id: product.id,
            name: product.name,
            slug: product.slug,
            description: product.description,
            categoryId: product.categoryId,
            pricingMode: product.pricingMode,
            price: paiseToRupeesInput(product.priceInPaise),
            makingCharge: product.makingChargeInPaise
              ? paiseToRupeesInput(product.makingChargeInPaise)
              : "",
            stoneCharge: product.stoneChargeInPaise
              ? paiseToRupeesInput(product.stoneChargeInPaise)
              : "",
            occasions: product.occasions,
            sizes: product.sizes.join(", "),
            spinVideoUrl: product.spinVideoUrl ?? "",
            stock: String(product.stock),
            metalType: product.metalType,
            purity: product.purity,
            metalColour: product.metalColour,
            netWeight: mgToGramsInput(product.netWeightMg),
            grossWeight: product.grossWeightMg ? mgToGramsInput(product.grossWeightMg) : "",
            gemstone: product.gemstone ?? "",
            huid: product.huid ?? "",
            hsnCode: product.hsnCode,
            gstRate: formatRate(product.gstRateBps).replace("%", ""),
            images: product.images,
            isActive: product.isActive,
            isFeatured: product.isFeatured,
            isReturnable: product.isReturnable,
          }}
        />
      </div>
      {orderCount === 0 && (
        <details className="border-border mt-10 rounded-md border p-4">
          <summary className="cursor-pointer text-sm font-semibold text-red-800">
            Delete this product
          </summary>
          <div className="mt-4">
            <DeleteProductForm id={product.id} name={product.name} />
          </div>
        </details>
      )}
    </div>
  );
}
