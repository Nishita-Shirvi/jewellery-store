/**
 * Staff permissions (Phase 21). The keys here are the source of truth; the database tables
 * (Permission, StaffRole, RolePermission) are seeded from them by the migration and the seed.
 * Pure module — safe to import anywhere, including client components.
 */

export const PERMISSIONS = {
  "orders.view": "See orders, customers' order details, returns and shipments",
  "orders.update": "Change order status, create shipments, generate invoices",
  "refunds.manage": "Cancel paid orders, approve/reject returns, send or record refunds",
  "cod.manage": "Record cash-on-delivery remittances",
  "products.view": "See products, categories and stock",
  "products.edit": "Create and edit products, variants, stock, photos and categories",
  "coupons.manage": "Create and edit coupons",
  "reviews.moderate": "Approve or reject reviews",
  "reports.view": "Sales reports, CSV export, marketing stats",
  "jobs.manage": "See and retry failed background jobs",
  "support.manage": "Read and answer customer support tickets",
  "faqs.manage": "Edit help-centre FAQs and canned replies",
  "content.manage": "Homepage, announcement bar, collections and editable pages",
  "system.view": "System health: uptime, background jobs, alerts and errors",
  "switches.manage": "Pause checkout, COD, coupons or recommendations (kill switches)",
  "accounting.manage": "Reconciliation, GST reports, bulk product import/export",
  "integrations.manage": "API keys and outgoing webhooks",
  "audit.view": "Read the activity log",
  "staff.manage": "Invite staff, change roles, deactivate staff, reset two-step sign-in",
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export const ROLES = {
  OWNER: {
    name: "Owner",
    description: "Everything, including staff",
    permissions: ALL_PERMISSIONS,
  },
  MANAGER: {
    name: "Manager",
    description: "Runs the store; can't manage staff",
    permissions: ALL_PERMISSIONS.filter((p) => p !== "staff.manage"),
  },
  CATALOG_EDITOR: {
    name: "Catalog editor",
    description: "Products, photos, stock, reviews, collections and homepage",
    permissions: ["products.view", "products.edit", "reviews.moderate", "content.manage"],
  },
  ORDER_MANAGER: {
    name: "Order manager",
    description: "Orders, shipping, returns, refunds, COD and support tickets",
    permissions: [
      "orders.view",
      "orders.update",
      "refunds.manage",
      "cod.manage",
      "products.view",
      "support.manage",
    ],
  },
  SUPPORT: {
    name: "Support",
    description:
      "Answers customers (tickets, FAQs); can look up orders and products but not change them",
    permissions: ["orders.view", "products.view", "support.manage", "faqs.manage"],
  },
} as const satisfies Record<
  string,
  { name: string; description: string; permissions: readonly Permission[] }
>;

export type RoleKey = keyof typeof ROLES;
export const ROLE_KEYS = Object.keys(ROLES) as RoleKey[];

export function isPermission(value: string): value is Permission {
  return value in PERMISSIONS;
}

/** Which admin page needs which permission (pages and nav both use this). */
export const PAGE_PERMISSIONS: { href: string; label: string; permission: Permission | null }[] = [
  { href: "/admin", label: "Dashboard", permission: null },
  { href: "/admin/reports", label: "Reports", permission: "reports.view" },
  { href: "/admin/orders", label: "Orders", permission: "orders.view" },
  { href: "/admin/returns", label: "Returns", permission: "orders.view" },
  { href: "/admin/support", label: "Support", permission: "support.manage" },
  { href: "/admin/faqs", label: "FAQs", permission: "faqs.manage" },
  { href: "/admin/cod", label: "Cash on delivery", permission: "cod.manage" },
  { href: "/admin/products", label: "Products", permission: "products.view" },
  { href: "/admin/categories", label: "Categories", permission: "products.view" },
  { href: "/admin/content", label: "Content", permission: "content.manage" },
  { href: "/admin/coupons", label: "Coupons", permission: "coupons.manage" },
  { href: "/admin/reviews", label: "Reviews", permission: "reviews.moderate" },
  { href: "/admin/marketing", label: "Marketing", permission: "reports.view" },
  { href: "/admin/jobs", label: "Jobs", permission: "jobs.manage" },
  { href: "/admin/system", label: "System", permission: "system.view" },
  { href: "/admin/accounting", label: "Accounting", permission: "accounting.manage" },
  { href: "/admin/integrations", label: "Integrations", permission: "integrations.manage" },
  { href: "/admin/audit", label: "Activity log", permission: "audit.view" },
  { href: "/admin/staff", label: "Staff", permission: "staff.manage" },
];
