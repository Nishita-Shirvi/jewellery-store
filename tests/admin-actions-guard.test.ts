import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Every admin server action must refuse customers (403) and guests (401) BEFORE touching
 * any data — even if someone bypasses the middleware and calls the action directly.
 */

const session = vi.hoisted(() => ({
  current: null as null | { user: { id: string; role: string } },
}));
const dbRole = vi.hoisted(() => ({ current: "CUSTOMER" as string | null }));
const touched = vi.hoisted(() => [] as string[]);

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("@/auth", () => ({ auth: async () => session.current }));
vi.mock("@/services/auth.service", () => ({ getUserRole: async () => dbRole.current }));

const spy = (name: string) =>
  vi.fn(async () => {
    touched.push(name);
    return { id: "x", slug: "x" };
  });
vi.mock("@/services/admin/product-admin.service", () => ({
  AdminInputError: class extends Error {},
  createProduct: spy("createProduct"),
  updateProduct: spy("updateProduct"),
  setProductActive: spy("setProductActive"),
  setProductStock: spy("setProductStock"),
}));
vi.mock("@/services/admin/category-admin.service", () => ({
  createCategory: spy("createCategory"),
  updateCategory: spy("updateCategory"),
  deleteCategory: spy("deleteCategory"),
}));
vi.mock("@/services/admin/order-admin.service", () => ({
  updateOrderStatus: spy("updateOrderStatus"),
}));
vi.mock("@/services/upload.service", () => ({
  UploadError: class extends Error {},
  uploadProductImage: spy("upload"),
}));
vi.mock("@/services/return.service", () => ({
  ReturnError: class extends Error {},
  approveReturn: spy("approveReturn"),
  rejectReturn: spy("rejectReturn"),
}));
vi.mock("@/services/refund.service", () => ({ retryRefund: spy("retryRefund") }));
vi.mock("@/services/invoice.service", () => ({ createInvoiceForOrder: spy("createInvoice") }));
vi.mock("@/services/admin/coupon-admin.service", () => ({
  saveCoupon: spy("saveCoupon"),
  setCouponActive: spy("setCouponActive"),
}));
vi.mock("@/services/shipment.service", () => ({
  ShipmentError: class extends Error {},
  createShipmentForOrder: spy("createShipment"),
}));

const actions = await import("@/app/admin/actions");
const { ForbiddenError, UnauthorizedError } = await import("@/lib/auth-guards");

function validForm() {
  const fd = new FormData();
  for (const [k, v] of Object.entries({
    id: "abc123",
    returnId: "abc123",
    orderId: "abc123",
    refundId: "abc123",
    note: "reason",
    isActive: "false",
    stock: "5",
    status: "SHIPPED",
    name: "Valid Name",
    description: "A valid description here.",
    categoryId: "abc123",
    price: "100",
    stock2: "1",
    metalType: "GOLD",
    purity: "K22",
    metalColour: "YELLOW",
    netWeight: "1",
    images: "/images/products/infinity-ring.svg",
    file: new File([new Uint8Array([1])], "a.png"),
  }))
    fd.append(k, v as string | Blob);
  return fd;
}

const calls: [string, () => Promise<unknown>][] = [
  ["saveProductAction", () => actions.saveProductAction({}, validForm())],
  ["toggleProductActiveAction", () => actions.toggleProductActiveAction(validForm())],
  ["updateStockAction", () => actions.updateStockAction(validForm())],
  ["uploadImageAction", () => actions.uploadImageAction(validForm())],
  ["saveCategoryAction", () => actions.saveCategoryAction({}, validForm())],
  ["deleteCategoryAction", () => actions.deleteCategoryAction(validForm())],
  ["updateOrderStatusAction", () => actions.updateOrderStatusAction(validForm())],
  ["createShipmentAction", () => actions.createShipmentAction(validForm())],
  ["approveReturnAction", () => actions.approveReturnAction(validForm())],
  ["rejectReturnAction", () => actions.rejectReturnAction(validForm())],
  ["retryRefundAction", () => actions.retryRefundAction(validForm())],
  ["generateInvoiceAction", () => actions.generateInvoiceAction(validForm())],
  ["saveCouponAction", () => actions.saveCouponAction({}, validForm())],
  ["toggleCouponAction", () => actions.toggleCouponAction(validForm())],
];

describe("admin actions are protected on the server", () => {
  beforeEach(() => {
    touched.length = 0;
  });

  it("covers every exported admin action", () => {
    expect(Object.keys(actions).sort()).toEqual(calls.map(([n]) => n).sort());
  });

  it.each(calls)("%s → 403 for a customer, nothing touched", async (_name, call) => {
    session.current = { user: { id: "u1", role: "CUSTOMER" } };
    dbRole.current = "CUSTOMER";
    await expect(call()).rejects.toBeInstanceOf(ForbiddenError);
    expect(touched).toEqual([]);
  });

  it.each(calls)(
    "%s → 403 when the cookie says ADMIN but the database says CUSTOMER (demoted)",
    async (_n, call) => {
      session.current = { user: { id: "u1", role: "ADMIN" } };
      dbRole.current = "CUSTOMER";
      await expect(call()).rejects.toBeInstanceOf(ForbiddenError);
      expect(touched).toEqual([]);
    },
  );

  it.each(calls)("%s → 401 for a guest", async (_n, call) => {
    session.current = null;
    await expect(call()).rejects.toBeInstanceOf(UnauthorizedError);
    expect(touched).toEqual([]);
  });

  it("an admin does reach the service", async () => {
    session.current = { user: { id: "a1", role: "ADMIN" } };
    dbRole.current = "ADMIN";
    await actions.toggleProductActiveAction(validForm());
    expect(touched).toEqual(["setProductActive"]);
  });
});
