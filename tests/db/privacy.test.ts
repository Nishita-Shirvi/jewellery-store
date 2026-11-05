import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 27 — privacy against a real PostgreSQL database: consents change behaviour, data export,
 * account deletion (orders kept), daily clean-up, and addresses encrypted at rest.
 */

process.env.FEATURE_SMS = "true";
process.env.MSG91_AUTH_KEY = "msg91-test-key";
process.env.MSG91_ORDER_FLOW_ID = "flow-test";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
  unstable_cache: <T>(fn: T) => fn,
}));
const sms = vi.hoisted(() => [] as string[]);
vi.stubGlobal("fetch", async (url: string, init?: { body?: string }) => {
  if (String(url).includes("msg91")) sms.push(init?.body ?? "");
  return new Response("{}", { status: 200 });
});

const { db } = await import("@/lib/db");
const privacy = await import("@/services/privacy.service");
const addresses = await import("@/services/address.service");
const marketing = await import("@/services/marketing.service");
const { deliverOrderSms } = await import("@/services/notification.service");
const { registerUser } = await import("@/services/auth.service");
const { isEncrypted } = await import("@/lib/pii");

const RUN = `pv${Date.now().toString(36)}`;
const DAY = 86_400_000;
const userIds: string[] = [];
let seq = 0;
let categoryId = "";

async function customer(extra: { emailMarketingConsent?: boolean } = {}) {
  const u = await db.user.create({
    data: { email: `${RUN}-${++seq}@example.com`, name: `Customer ${seq}`, ...extra },
  });
  userIds.push(u.id);
  return u;
}

const ADDRESS = {
  fullName: "Priya Sharma",
  phone: "9876543210",
  line1: "12 MG Road",
  city: "Hyderabad",
  state: "Telangana",
  pincode: "500001",
} as never;

async function order(userId: string, status: "PAID" | "DELIVERED" | "SHIPPED" = "DELIVERED") {
  return db.order.create({
    data: {
      userId,
      status,
      paidAt: new Date(),
      subtotalInPaise: 100,
      totalInPaise: 100,
      addressSnapshot: addresses.sealSnapshot({
        fullName: "Priya Sharma",
        phone: "9876543210",
        line1: "12 MG Road",
        line2: null,
        landmark: null,
        city: "Hyderabad",
        state: "Telangana",
        pincode: "500001",
        country: "IN",
      }),
    },
  });
}

beforeAll(async () => {
  categoryId = (await db.category.create({ data: { name: `${RUN} cat`, slug: `${RUN}-cat` } })).id;
});
beforeEach(() => {
  sms.length = 0;
});
afterAll(async () => {
  await db.order.deleteMany({ where: { userId: { in: userIds } } });
  await db.consentEvent.deleteMany({ where: { userId: { in: userIds } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.product.deleteMany({ where: { slug: { startsWith: RUN } } });
  await db.category.deleteMany({ where: { id: categoryId } });
  await db.$disconnect();
});

describe("addresses are encrypted at rest", () => {
  it("saved addresses and order addresses can't be read from the database directly", async () => {
    const u = await customer();
    const a = await addresses.createAddress(u.id, ADDRESS);
    expect(a.phone).toBe("9876543210"); // the app sees it normally
    const raw = await db.address.findUniqueOrThrow({ where: { id: a.id } });
    for (const f of ["fullName", "phone", "line1"] as const) expect(isEncrypted(raw[f])).toBe(true);
    expect(raw.city).toBe("Hyderabad");
    expect((await addresses.listAddresses(u.id))[0]).toMatchObject({ fullName: "Priya Sharma" });

    const o = await order(u.id);
    const snap = (await db.order.findUniqueOrThrow({ where: { id: o.id } }))
      .addressSnapshot as Record<string, string>;
    expect(JSON.stringify(snap)).not.toContain("9876543210");
    expect(addresses.openSnapshot(snap).phone).toBe("9876543210");
  });
});

describe("consents change what we send", () => {
  it("every change is logged; the switch takes effect", async () => {
    const u = await customer();
    await privacy.setConsent(u.id, "email_marketing", true, "account");
    await privacy.setConsent(u.id, "sms_updates", false, "account");
    const c = await privacy.getConsents(u.id);
    expect(c).toMatchObject({ emailMarketingConsent: true, smsUpdatesConsent: false });
    expect(c.history.map((h) => `${h.channel}:${h.granted}`)).toEqual([
      "sms_updates:false",
      "email_marketing:true",
    ]);
  });

  it("order-update SMS: sent normally, not after the customer turns them off", async () => {
    const u = await customer();
    const o = await order(u.id, "SHIPPED");
    await deliverOrderSms(o.id, "shipped");
    expect(sms).toHaveLength(1);
    expect(sms[0]).toContain("9876543210"); // decrypted for sending
    await privacy.setConsent(u.id, "sms_updates", false, "account");
    await deliverOrderSms(o.id, "shipped");
    expect(sms).toHaveLength(1);
  });

  it("an unsubscribe link also withdraws the account's marketing consent (logged)", async () => {
    const u = await customer({ emailMarketingConsent: true });
    await marketing.unsubscribe(u.email, "one-click");
    const after = await privacy.getConsents(u.id);
    expect(after.emailMarketingConsent).toBe(false);
    expect(after.history[0]).toMatchObject({
      channel: "email_marketing",
      granted: false,
      source: "unsubscribe_link",
    });
    await db.subscriber.deleteMany({ where: { email: u.email } });
  });
});

describe("download my data", () => {
  it("has the customer's data, readable — and nothing of other customers or staff notes", async () => {
    const me = await customer();
    const other = await customer();
    await addresses.createAddress(me.id, ADDRESS);
    await addresses.createAddress(other.id, {
      ...(ADDRESS as object),
      fullName: "Someone Else",
    } as never);
    await order(me.id);
    const ticket = await db.supportTicket.create({
      data: {
        userId: me.id,
        subject: "Clasp question",
        messages: {
          create: [
            { body: "Is the clasp gold?", fromStaff: false },
            { body: "INTERNAL: VIP customer", fromStaff: true, internal: true },
          ],
        },
      },
    });
    const data = await privacy.exportUserData(me.id);
    const text = JSON.stringify(data);
    expect(data.account.email).toBe(me.email);
    expect(data.addresses[0]).toMatchObject({ fullName: "Priya Sharma", phone: "9876543210" });
    expect(data.orders[0]!.addressSnapshot.line1).toBe("12 MG Road");
    expect(text).toContain("Is the clasp gold?");
    expect(text).not.toContain("INTERNAL: VIP customer");
    expect(text).not.toContain("Someone Else");
    expect(text).not.toContain("pii:v1:");
    await db.supportTicket.delete({ where: { id: ticket.id } });
  });
});

describe("delete my account", () => {
  it("refused while an order is still in progress, and for staff", async () => {
    const u = await customer();
    await order(u.id, "SHIPPED");
    await expect(privacy.deleteAccount(u.id)).rejects.toThrow(/still in progress/);
    const staff = await db.user.create({
      data: { email: `${RUN}-staff@example.com`, role: "ADMIN" },
    });
    userIds.push(staff.id);
    await expect(privacy.deleteAccount(staff.id)).rejects.toThrow(/Staff accounts/);
  });

  it("removes personal data, keeps orders (tax) and reviews (anonymous), signs out everywhere", async () => {
    const u = await customer({ emailMarketingConsent: true });
    const email = u.email;
    await addresses.createAddress(u.id, ADDRESS);
    const o = await order(u.id, "DELIVERED");
    const product = await db.product.create({
      data: {
        name: `${RUN} ring`,
        slug: `${RUN}-ring`,
        description: "x",
        priceInPaise: 100,
        images: [],
        categoryId,
        metalType: "GOLD",
        purity: "K22",
        metalColour: "YELLOW",
        netWeightMg: 1,
      },
    });
    await db.review.create({
      data: {
        userId: u.id,
        productId: product.id,
        rating: 5,
        title: "Lovely",
        body: "Lovely ring",
        images: [],
        authorName: "Customer A.",
        status: "APPROVED",
      },
    });
    await db.wishlistItem.create({ data: { userId: u.id, productId: product.id } });
    await db.subscriber.create({ data: { email, status: "SUBSCRIBED" } });

    await privacy.deleteAccount(u.id);

    const after = await db.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(after.email).toBe(`deleted+${u.id}@deleted.invalid`);
    expect(after).toMatchObject({ name: null, passwordHash: null, emailMarketingConsent: false });
    expect(after.deletedAt).not.toBeNull();
    expect(after.passwordChangedAt).not.toBeNull(); // ends sessions on every device
    expect(await db.address.count({ where: { userId: u.id } })).toBe(0);
    expect(await db.wishlistItem.count({ where: { userId: u.id } })).toBe(0);
    expect(await db.subscriber.count({ where: { email } })).toBe(0);
    // Kept: the order with its (encrypted) address, and the review without the name.
    const kept = await db.order.findUniqueOrThrow({ where: { id: o.id } });
    expect(addresses.openSnapshot(kept.addressSnapshot).fullName).toBe("Priya Sharma");
    expect((await db.review.findFirstOrThrow({ where: { userId: u.id } })).authorName).toBe(
      "Former customer",
    );
    // Deleting twice is refused; the email can be used for a brand-new account.
    await expect(privacy.deleteAccount(u.id)).rejects.toThrow(/already been deleted/);
    const fresh = await registerUser({
      name: "New Me",
      email,
      password: "Fresh2026pass",
      confirmPassword: "Fresh2026pass",
    } as never);
    userIds.push(fresh.id);
    expect(fresh.id).not.toBe(u.id);
    await db.review.deleteMany({ where: { productId: product.id } });
  });
});

describe("daily clean-up", () => {
  it("deletes only data past its retention; orders are untouched; running again deletes nothing", async () => {
    const u = await customer();
    const old = new Date(Date.now() - 10 * DAY);
    await db.otpChallenge.createMany({
      data: [
        { userId: u.id, phone: "x", purpose: "cod", codeHash: "h", expiresAt: old, createdAt: old },
        {
          userId: u.id,
          phone: "y",
          purpose: "cod",
          codeHash: "h",
          expiresAt: new Date(),
          createdAt: new Date(),
        },
      ],
    });
    await db.subscriber.createMany({
      data: [
        {
          email: `${RUN}-old@example.com`,
          status: "PENDING",
          createdAt: new Date(Date.now() - 40 * DAY),
        },
        { email: `${RUN}-new@example.com`, status: "PENDING" },
      ],
    });
    const o = await order(u.id);
    const first = await privacy.purgeOldData();
    expect(first.otpChallenges).toBeGreaterThanOrEqual(1);
    expect(await db.otpChallenge.count({ where: { userId: u.id } })).toBe(1);
    expect(await db.subscriber.count({ where: { email: { startsWith: RUN } } })).toBe(1);
    expect(await db.order.findUnique({ where: { id: o.id } })).not.toBeNull();
    const second = await privacy.purgeOldData();
    expect(second.otpChallenges + second.unconfirmedSubscribers).toBe(0);
    expect(await privacy.purgeIsDue()).toBe(false);
    await db.subscriber.deleteMany({ where: { email: { startsWith: RUN } } });
  });
});
