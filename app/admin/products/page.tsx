import Image from "next/image";
import Link from "next/link";
import { Pager } from "@/components/admin/pager";
import { ConfirmSubmit } from "@/components/admin/confirm-submit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatINR } from "@/lib/format";
import { adminListQuerySchema } from "@/lib/validation/admin";
import { listProductsAdmin } from "@/services/admin/product-admin.service";
import { toggleProductActiveAction, updateStockAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const query = adminListQuerySchema.parse(await searchParams);
  const { items, total, pageCount } = await listProductsAdmin(query);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          Products <span className="text-muted-foreground text-base font-normal">({total})</span>
        </h1>
        <Button asChild>
          <Link href="/admin/products/new">Add product</Link>
        </Button>
      </div>

      <form className="mt-6 flex flex-wrap gap-2" action="/admin/products" role="search">
        <Input
          name="q"
          defaultValue={query.q}
          placeholder="Search by name"
          aria-label="Search products"
          className="w-56"
        />
        <select
          name="status"
          defaultValue={query.status ?? ""}
          aria-label="Filter"
          className="border-input bg-background h-9 rounded-md border px-2 text-sm"
        >
          <option value="">All</option>
          <option value="active">Visible</option>
          <option value="inactive">Hidden</option>
          <option value="low">Low stock</option>
        </select>
        <Button type="submit" variant="outline">
          Filter
        </Button>
      </form>

      <div className="border-border mt-6 overflow-x-auto rounded-md border">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-muted text-muted-foreground text-left text-xs">
            <tr>
              <th className="p-3">Product</th>
              <th className="p-3">Category</th>
              <th className="p-3">Price</th>
              <th className="p-3">Stock</th>
              <th className="p-3">Status</th>
              <th className="p-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {items.map((p) => (
              <tr key={p.id}>
                <td className="p-3">
                  <div className="flex items-center gap-3">
                    <Image
                      src={p.images[0] ?? "/images/products/classic-solitaire-ring.svg"}
                      alt=""
                      width={40}
                      height={40}
                      unoptimized
                      className="border-border rounded border"
                    />
                    <Link href={`/admin/products/${p.id}`} className="font-medium hover:underline">
                      {p.name}
                    </Link>
                  </div>
                </td>
                <td className="p-3">{p.category.name}</td>
                <td className="p-3">{formatINR(p.priceInPaise)}</td>
                <td className="p-3">
                  <form action={updateStockAction} className="flex items-center gap-1">
                    <input type="hidden" name="id" value={p.id} />
                    <Input
                      name="stock"
                      type="number"
                      min={0}
                      defaultValue={p.stock}
                      aria-label={`Stock for ${p.name}`}
                      className="h-8 w-20"
                    />
                    <Button type="submit" variant="ghost" size="sm">
                      Save
                    </Button>
                  </form>
                  {p.reservedStock > 0 && (
                    <p className="mt-1 text-xs text-amber-700">
                      {p.reservedStock} held in checkouts
                    </p>
                  )}
                </td>
                <td className="p-3">
                  {p.isActive ? "Visible" : <span className="text-muted-foreground">Hidden</span>}
                  {p.isFeatured && " · Featured"}
                </td>
                <td className="p-3 text-right">
                  <form action={toggleProductActiveAction}>
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="isActive" value={p.isActive ? "false" : "true"} />
                    {p.isActive ? (
                      <ConfirmSubmit
                        label="Hide"
                        title={`Hide ${p.name}?`}
                        description="It will disappear from the store. Existing orders aren't affected. You can show it again any time."
                        confirmLabel="Hide product"
                      />
                    ) : (
                      <Button type="submit" variant="outline" size="sm">
                        Show
                      </Button>
                    )}
                  </form>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="text-muted-foreground p-6 text-center">
                  No products found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pager
        basePath="/admin/products"
        params={{ q: query.q, status: query.status }}
        page={query.page}
        pageCount={pageCount}
      />
    </div>
  );
}
