import { CategoryForm } from "@/components/admin/category-form";
import { ConfirmSubmit } from "@/components/admin/confirm-submit";
import { listCategoriesAdmin } from "@/services/admin/category-admin.service";
import { deleteCategoryAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function AdminCategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const categories = await listCategoriesAdmin();

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight">Categories</h1>
      {error && (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {error.slice(0, 200)}
        </p>
      )}
      <section aria-labelledby="new-cat">
        <h2 id="new-cat" className="mb-2 text-sm font-semibold">
          Add a category
        </h2>
        <CategoryForm />
      </section>
      <section aria-labelledby="all-cats">
        <h2 id="all-cats" className="mb-2 text-sm font-semibold">
          All categories
        </h2>
        <ul className="divide-border border-border divide-y rounded-md border">
          {categories.map((c) => (
            <li key={c.id} className="flex flex-wrap items-start justify-between gap-3 p-3">
              <CategoryForm category={c} />
              <div className="text-muted-foreground flex items-center gap-3 text-xs">
                <span>{c._count.products} products</span>
                <form action={deleteCategoryAction}>
                  <input type="hidden" name="id" value={c.id} />
                  <ConfirmSubmit
                    label="Delete"
                    title={`Delete ${c.name}?`}
                    description={
                      c._count.products > 0
                        ? "This category still has products, so it can't be deleted. Hide it instead, or move its products first."
                        : "This removes the category permanently."
                    }
                    confirmLabel="Delete category"
                  />
                </form>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
