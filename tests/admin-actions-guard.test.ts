import { beforeEach, describe, expect, it, vi } from "vitest";
import { ALL_PERMISSIONS, ROLES, type Permission } from "@/lib/permissions";

/**
 * Every admin server action must check, on the server and BEFORE touching any data:
 * signed in (401), staff (403), two-step sign-in passed (403), and its own permission (403) —
 * even if someone bypasses the middleware and calls the action directly. Successful actions
 * must write to the activity log.
 */

const session = vi.hoisted(() => ({
  current: null as null | { user: { id: string; role: string; email: string } },
}));
const access = vi.hoisted(() => ({
  current: {
    isStaff: false,
    permissions: [] as string[],
    roleKeys: [] as string[],
    totpEnabledAt: null as Date | null,
  },
}));
const twoFA = vi.hoisted(() => ({ passed: true }));
const touched = vi.hoisted(() => [] as string[]);
const auditMock = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: "signed-2fa-cookie" }), set: vi.fn() }),
}));
vi.mock("@/auth", () => ({ auth: async () => session.current }));

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
  getProductAdmin: vi.fn(async () => ({
    id: "abc123",
    name: "Old name",
    stock: 1,
    priceInPaise: 1,
  })),
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
vi.mock("@/services/refund.service", () => ({
  retryRefund: spy("retryRefund"),
  markManualRefundPaid: spy("markManualRefundPaid"),
}));
vi.mock("@/services/cod.service", () => ({ markCashReceived: spy("markCashReceived") }));
vi.mock("@/services/invoice.service", () => ({ createInvoiceForOrder: spy("createInvoice") }));
vi.mock("@/services/audit.service", () => ({ audit: auditMock, diff: () => ({}) }));
vi.mock("@/services/support.service", () => ({
  SupportError: class extends Error {},
  readAttachments: async () => [],
  staffReply: spy("staffReply"),
  assignTicket: spy("assignTicket"),
  setTicketStatus: spy("setTicketStatus"),
  saveFaq: vi.fn(async () => {
    touched.push("saveFaq");
    return { id: "f1" };
  }),
  deleteFaq: spy("deleteFaq"),
  saveCannedReply: vi.fn(async () => {
    touched.push("saveCannedReply");
    return { id: "c1" };
  }),
  deleteCannedReply: spy("deleteCannedReply"),
}));
vi.mock("@/services/staff.service", () => ({
  TWO_FACTOR_COOKIE: "staff_2fa",
  StaffError: class extends Error {},
  getStaffAccess: async () => access.current,
  twoFactorCookieValid: () => twoFA.passed,
  inviteStaff: vi.fn(async () => {
    touched.push("inviteStaff");
    return { inviteId: "i1", link: "http://localhost/staff/invite?token=x" };
  }),
  setStaffRoles: spy("setStaffRoles"),
  deactivateStaff: spy("deactivateStaff"),
  reactivateStaff: spy("reactivateStaff"),
  resetTwoFactor: spy("resetTwoFactor"),
  revokeInvite: spy("revokeInvite"),
}));
vi.mock("@/services/review.service", () => ({
  ReviewError: class extends Error {},
  moderateReview: spy("moderateReview"),
}));
vi.mock("@/services/admin/coupon-admin.service", () => ({
  saveCoupon: spy("saveCoupon"),
  setCouponActive: spy("setCouponActive"),
}));
vi.mock("@/services/admin/variant-admin.service", () => ({
  saveOptions: spy("saveOptions"),
  bulkUpdateVariants: spy("bulkUpdateVariants"),
}));
vi.mock("@/services/merch.service", () => ({
  ContentInputError: class extends Error {},
  saveCollection: spy("saveCollection"),
  setCollectionProducts: spy("setCollectionProducts"),
  deleteCollection: spy("deleteCollection"),
  createStarterCollections: spy("createStarterCollections"),
  saveHomeSection: spy("saveHomeSection"),
  deleteHomeSection: spy("deleteHomeSection"),
  saveAnnouncement: spy("saveAnnouncement"),
  deleteAnnouncement: spy("deleteAnnouncement"),
  savePageDraft: spy("savePageDraft"),
  publishPage: spy("publishPage"),
  unpublishPage: spy("unpublishPage"),
  deletePage: spy("deletePage"),
}));
vi.mock("@/services/product-csv.service", () => ({
  importProductsCsv: vi.fn(async () => {
    touched.push("importProductsCsv");
    return { rows: [], created: 1, updated: 0, errors: 0, applied: true };
  }),
}));
vi.mock("@/services/recon.service", () => ({
  parseSettlementCsv: vi.fn(() => []),
  parseRemittanceCsv: vi.fn(() => []),
  reconcileSettlement: spy("reconcileSettlement"),
  reconcileRemittance: spy("reconcileRemittance"),
  getReconRun: vi.fn(async () => ({
    id: "abc123",
    kind: "cod_remittance",
    source: "upload: x.csv",
    issues: [{ kind: "ready_to_record", orderId: "abc123" }],
  })),
}));
vi.mock("@/services/integrations.service", () => ({
  createApiKey: vi.fn(async () => {
    touched.push("createApiKey");
    return { id: "k1", name: "Feed", prefix: "sk_live_abcd", key: "sk_live_secret" };
  }),
  revokeApiKey: spy("revokeApiKey"),
  createWebhookEndpoint: vi.fn(async () => {
    touched.push("createWebhookEndpoint");
    return { id: "w1", url: "https://hooks.example.com/x", secret: "whsec_x" };
  }),
  setWebhookActive: spy("setWebhookActive"),
  deleteWebhookEndpoint: spy("deleteWebhookEndpoint"),
}));
vi.mock("@/services/manual-shipping.service", () => ({
  MANUAL_UPDATE_STATUSES: ["PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED"],
  MANUAL_UPDATE_LABEL: { IN_TRANSIT: "In transit" },
  saveManualTracking: spy("saveManualTracking"),
  addManualUpdate: spy("addManualUpdate"),
}));
vi.mock("@/services/monitor.service", () => ({
  evaluateAlerts: vi.fn(async () => {
    touched.push("evaluateAlerts");
    return [];
  }),
}));
vi.mock("@/services/jobs.service", () => ({
  enqueueAndRunNow: vi.fn(async () => {
    touched.push("enqueueAndRunNow");
    return { outcome: "done", error: null };
  }),
  retryDeadJob: spy("retryDeadJob"),
  runDueJobs: spy("runDueJobs"),
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
    decision: "APPROVED",
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
    productId: "abc123",
    option0Name: "Ring size",
    option0Values: "10, 12",
    variantId: "abc123",
    sku_abc123: "SKU-ONE",
    price_abc123: "100",
    stock_abc123: "1",
    net_abc123: "1",
    active_abc123: "on",
    reference: "UTR123456",
    jobId: "abc123",
    ticketId: "abc123",
    ticketStatus: "RESOLVED",
    assigneeId: "",
    faqId: "abc123",
    courier: "Blue Dart",
    runId: "abc123",
    reconKind: "cod_remittance",
    keyName: "Marketplace feed",
    keyId: "abc123",
    webhookUrl: "https://hooks.example.com/orders",
    webhookId: "abc123",
    webhookActive: "true",
    awb: "BD123456789",
    shipStatus: "IN_TRANSIT",
    // Content (Phase 24)
    collectionId: "abc123",
    sectionId: "abc123",
    announcementId: "abc123",
    pageId: "abc123",
    slug: "summer-sale",
    kind: "MANUAL",
    sectionKind: "TEXT",
    contentStatus: "DRAFT",
    message: "Diwali sale: 10% off gold coins",
    draftBody: "About us",
    question: "How long does delivery take?",
    answer: "Usually 3 to 5 working days.",
    position: "0",
    isPublished: "on",
    cannedId: "abc123",
    title: "Delivery times",
    cannedBody: "Usually 3 to 5 working days.",
    body: "Thanks for your message — it's on its way.",
    email: "new.staff@example.com",
    role: "SUPPORT",
    userId: "abc123",
    roles: "SUPPORT",
    inviteId: "abc123",
    hsnCode: "7113",
    gstRate: "3",
    code: "SAVE10",
    type: "PERCENT",
    value: "10",
    minOrder: "",
    maxDiscount: "",
    makingCharge: "",
    grossWeight: "",
    file: new File([new Uint8Array([1])], "a.png"),
  }))
    fd.append(k, v as string | Blob);
  return fd;
}

/** The permission each action needs. The tests below prove the code asks for exactly this. */
const NEEDS: Record<string, Permission> = {
  saveProductAction: "products.edit",
  toggleProductActiveAction: "products.edit",
  updateStockAction: "products.edit",
  uploadImageAction: "products.edit",
  saveCategoryAction: "products.edit",
  deleteCategoryAction: "products.edit",
  updateOrderStatusAction: "orders.update",
  createShipmentAction: "orders.update",
  approveReturnAction: "refunds.manage",
  rejectReturnAction: "refunds.manage",
  retryRefundAction: "refunds.manage",
  generateInvoiceAction: "orders.update",
  saveCouponAction: "coupons.manage",
  toggleCouponAction: "coupons.manage",
  moderateReviewAction: "reviews.moderate",
  saveVariantOptionsAction: "products.edit",
  saveVariantsAction: "products.edit",
  markCashReceivedAction: "cod.manage",
  markRefundPaidAction: "refunds.manage",
  retryJobAction: "jobs.manage",
  inviteStaffAction: "staff.manage",
  setStaffRolesAction: "staff.manage",
  deactivateStaffAction: "staff.manage",
  reactivateStaffAction: "staff.manage",
  resetStaffTwoFactorAction: "staff.manage",
  revokeInviteAction: "staff.manage",
  staffReplyTicketAction: "support.manage",
  assignTicketAction: "support.manage",
  setTicketStatusAction: "support.manage",
  saveCollectionAction: "content.manage",
  setCollectionProductsAction: "content.manage",
  deleteCollectionAction: "content.manage",
  createStarterCollectionsAction: "content.manage",
  saveHomeSectionAction: "content.manage",
  deleteHomeSectionAction: "content.manage",
  saveAnnouncementAction: "content.manage",
  deleteAnnouncementAction: "content.manage",
  savePageAction: "content.manage",
  publishPageAction: "content.manage",
  unpublishPageAction: "content.manage",
  deletePageAction: "content.manage",
  runAlertChecksAction: "system.view",
  saveManualTrackingAction: "orders.update",
  importProductsAction: "accounting.manage",
  reconcileUploadAction: "accounting.manage",
  recordRemittanceAction: "cod.manage",
  createApiKeyAction: "integrations.manage",
  revokeApiKeyAction: "integrations.manage",
  createWebhookAction: "integrations.manage",
  setWebhookActiveAction: "integrations.manage",
  addManualShipmentUpdateAction: "orders.update",
  saveFaqAction: "faqs.manage",
  deleteFaqAction: "faqs.manage",
  saveCannedReplyAction: "faqs.manage",
  deleteCannedReplyAction: "faqs.manage",
};

type Action = (...args: unknown[]) => Promise<unknown>;
const call = (name: string) => {
  const fn = (actions as unknown as Record<string, Action>)[name]!;
  return fn.length >= 2 ? fn({}, validForm()) : fn(validForm());
};
const names = Object.keys(NEEDS);

function signedInAs(perms: readonly string[], opts: { staff?: boolean; twoFA?: boolean } = {}) {
  session.current = { user: { id: "u1", role: "ADMIN", email: "staff@example.com" } };
  access.current = {
    isStaff: opts.staff ?? true,
    permissions: [...perms],
    roleKeys: [],
    totpEnabledAt: new Date(),
  };
  twoFA.passed = opts.twoFA ?? true;
}

const deniedLogged = () =>
  auditMock.mock.calls.some(([, entry]) => (entry as { action: string }).action === "auth.denied");
const workLogged = () =>
  auditMock.mock.calls.some(([, entry]) => (entry as { action: string }).action !== "auth.denied");

describe("admin actions are protected on the server", () => {
  beforeEach(() => {
    touched.length = 0;
    auditMock.mockClear();
  });

  it("covers every exported admin action", () => {
    expect(Object.keys(actions).sort()).toEqual([...names].sort());
  });

  it.each(names)("%s → 401 for a guest", async (name) => {
    session.current = null;
    await expect(call(name)).rejects.toBeInstanceOf(UnauthorizedError);
    expect(touched).toEqual([]);
  });

  it.each(names)("%s → 403 for a customer (or a demoted / deactivated admin)", async (name) => {
    signedInAs(ALL_PERMISSIONS, { staff: false });
    await expect(call(name)).rejects.toBeInstanceOf(ForbiddenError);
    expect(touched).toEqual([]);
    expect(deniedLogged()).toBe(true);
  });

  it.each(names)("%s → 403 for staff who haven't passed two-step sign-in", async (name) => {
    signedInAs(ALL_PERMISSIONS, { twoFA: false });
    await expect(call(name)).rejects.toBeInstanceOf(ForbiddenError);
    expect(touched).toEqual([]);
  });

  const notForSupport = names.filter(
    (n) => !(ROLES.SUPPORT.permissions as readonly string[]).includes(NEEDS[n]!),
  );
  it("SUPPORT can't refund, edit products, change orders or manage staff", () => {
    for (const n of [
      "approveReturnAction",
      "retryRefundAction",
      "markRefundPaidAction",
      "saveProductAction",
      "updateOrderStatusAction",
      "inviteStaffAction",
    ])
      expect(notForSupport).toContain(n);
  });

  it.each(notForSupport)("%s → 403 for SUPPORT", async (name) => {
    signedInAs(ROLES.SUPPORT.permissions);
    await expect(call(name)).rejects.toBeInstanceOf(ForbiddenError);
    expect(touched).toEqual([]);
    expect(deniedLogged()).toBe(true);
  });

  it.each(names)("%s → 403 with every permission except the one it needs", async (name) => {
    signedInAs(ALL_PERMISSIONS.filter((p) => p !== NEEDS[name]));
    await expect(call(name)).rejects.toBeInstanceOf(ForbiddenError);
    expect(touched).toEqual([]);
  });

  it.each(names)(
    "%s → works with just its permission, and is written to the activity log",
    async (name) => {
      signedInAs([NEEDS[name]!]);
      await call(name);
      expect(touched.length).toBeGreaterThan(0);
      expect(workLogged()).toBe(true);
    },
  );

  it("cancelling an order also needs refunds.manage (cancelling a paid order refunds it)", async () => {
    const form = validForm();
    form.set("status", "CANCELLED");
    signedInAs(["orders.update"]);
    await expect(actions.updateOrderStatusAction(form)).rejects.toBeInstanceOf(ForbiddenError);
    expect(touched).toEqual([]);
    signedInAs(["orders.update", "refunds.manage"]);
    await actions.updateOrderStatusAction(form);
    expect(touched).toEqual(["updateOrderStatus"]);
  });

  it("an admin's variant grid save reaches the service with parsed rows", async () => {
    signedInAs(["products.edit"]);
    const result = await actions.saveVariantsAction({}, validForm());
    expect(result).toMatchObject({ ok: true });
    expect(touched).toEqual(["bulkUpdateVariants"]);
  });
});
