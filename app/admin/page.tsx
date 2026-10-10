import Link from "next/link";
import { formatINR } from "@/lib/format";
import { LOW_STOCK_THRESHOLD, getDashboardStats } from "@/services/admin/dashboard.service";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const stats = await getDashboardStats();
  const cards = [
    { label: "Orders today", value: String(stats.ordersToday), href: "/admin/orders" },
    { label: "Revenue today", value: formatINR(stats.revenueTodayInPaise), href: "/admin/orders" },
    {
      label: "Waiting to ship",
      value: String(stats.awaitingShipment),
      href: "/admin/orders?status=PAID",
    },
    {
      label: "Low stock",
      value: String(stats.lowStock.length),
      href: "/admin/products?status=low",
    },
  ];

  return (
    <div className="space-y-10">
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
      <ul className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {cards.map((card) => (
          <li key={card.label}>
            <Link
              href={card.href}
              className="border-border hover:bg-muted block rounded-md border p-4"
            >
              <p className="text-muted-foreground text-xs">{card.label}</p>
              <p className="mt-1 text-2xl font-semibold" data-testid={`stat-${card.label}`}>
                {card.value}
              </p>
            </Link>
          </li>
        ))}
      </ul>
      <section aria-labelledby="low-stock">
        <h2 id="low-stock" className="font-medium">
          Low stock (≤ {LOW_STOCK_THRESHOLD})
        </h2>
        {stats.lowStock.length === 0 ? (
          <p className="text-muted-foreground mt-2 text-sm">Everything is well stocked.</p>
        ) : (
          <ul className="divide-border border-border mt-3 divide-y rounded-md border text-sm">
            {stats.lowStock.map((p) => (
              <li key={p.id} className="flex justify-between px-4 py-2">
                <Link href={`/admin/products/${p.id}`} className="hover:underline">
                  {p.name}
                </Link>
                <span className={p.stock === 0 ? "font-medium text-red-700" : "text-amber-700"}>
                  {p.stock === 0 ? "Out of stock" : `${p.stock} left`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="text-muted-foreground text-xs">“Today” is counted from midnight India time.</p>
    </div>
  );
}
