import { ProductForm } from "@/components/admin/product-form";
import { listCategoryOptions } from "@/services/admin/category-admin.service";
import { listPlaceholderImages } from "@/lib/placeholder-images";
import { isUploadConfigured } from "@/services/upload.service";

export default async function NewProductPage() {
  const [categories, placeholderImages] = await Promise.all([
    listCategoryOptions(),
    listPlaceholderImages(),
  ]);
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Add product</h1>
      <div className="mt-6">
        <ProductForm
          categories={categories}
          placeholderImages={placeholderImages}
          uploadEnabled={isUploadConfigured()}
          values={{
            name: "",
            slug: "",
            description: "",
            categoryId: categories[0]?.id ?? "",
            price: "",
            makingCharge: "",
            stock: "1",
            metalType: "GOLD",
            purity: "K22",
            metalColour: "YELLOW",
            netWeight: "",
            grossWeight: "",
            gemstone: "",
            huid: "",
            images: [],
            isActive: true,
            isFeatured: false,
            isReturnable: true,
          }}
        />
      </div>
    </div>
  );
}
