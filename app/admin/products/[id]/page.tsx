import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductForm } from "@/components/admin/product-form";
import { listCategoryOptions } from "@/services/admin/category-admin.service";
import { formatRate } from "@/lib/gst";
import { mgToGramsInput, paiseToRupeesInput } from "@/lib/money";
import { listPlaceholderImages } from "@/lib/placeholder-images";
import { getProductAdmin } from "@/services/admin/product-admin.service";
import { isUploadConfigured } from "@/services/upload.service";

export default async function EditProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { id } = await params;
  const { created } = await searchParams;
  const [product, categories, placeholderImages] = await Promise.all([
    getProductAdmin(id),
    listCategoryOptions(),
    listPlaceholderImages(),
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
          values={{
            id: product.id,
            name: product.name,
            slug: product.slug,
            description: product.description,
            categoryId: product.categoryId,
            price: paiseToRupeesInput(product.priceInPaise),
            makingCharge: product.makingChargeInPaise
              ? paiseToRupeesInput(product.makingChargeInPaise)
              : "",
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
    </div>
  );
}
