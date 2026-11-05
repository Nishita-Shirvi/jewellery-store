import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 23 — account lockout, password reset, and "one customer can't touch another's data"
 * (IDOR) across orders, addresses, returns, cancellations and invoices. Real PostgreSQL.
 */

process.env.RESEND_API_KEY = "re_test_key_security";
process.env.EMAIL_FROM = "Store <help@example.com>";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
  unstable_cache: <T>(fn: T) => fn,
}));

const outbox = vi.hoisted(() => [] as { to: string; html: string }[]);
vi.stubGlobal("fetch", async (url: string, init?: { body?: string }) => {
  if (String(url).startsWith("https://api.resend.com")) {
    outbox.push(JSON.parse(init?.body ?? "{}"));
    return new Response("{}", { status: 200 });
  }
  return new Response("{}", { status: 500 });
});

const { db } = await import("@/lib/db");
const auth = await import("@/services/auth.service");
const pw = await import("@/services/password.service");
const { runDueJobs } = await import("@/services/jobs.service");
const addresses = await import("@/services/address.service");
const orders = await import("@/services/order.service");
const returns = await import("@/services/return.service");
const { getInvoiceForViewer } = await import("@/services/invoice.service");
const { decryptPii } = await import("@/lib/pii");

const RUN = `as${Date.now().toString(36)}`;
const ids: string[] = [];
let n = 0;

async function account(password = "Correct2026") {
  const email = `${RUN}-${++n}@example.com`;
  const u = await db.user.create({
    data: { email, name: `Person ${n}`, passwordHash: await auth.hashPassword(password) },
  });
  ids.push(u.id);
  return { ...u, password };
}

beforeEach(() => {
  outbox.length = 0;
});
afterAll(async () => {
  await db.job.deleteMany({});
  await db.invoice.deleteMany({ where: { order: { userId: { in: ids } } } });
  await db.order.deleteMany({ where: { userId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  await db.$disconnect();
});

describe("account lockout", () => {
  it(`locks after ${auth.LOCK_AFTER_FAILURES} wrong passwords — then even the right one is refused for a while`, async () => {
    const u = await account();
    for (let i = 0; i < auth.LOCK_AFTER_FAILURES - 1; i++)
      expect(await auth.verifyCredentials({ email: u.email, password: "Wrong2026" })).toBeNull();
    await expect(
      auth.verifyCredentials({ email: u.email, password: "Wrong2026" }),
    ).rejects.toBeInstanceOf(auth.AccountLockedError);
    await expect(
      auth.verifyCredentials({ email: u.email, password: u.password }),
    ).rejects.toBeInstanceOf(auth.AccountLockedError);
    // Lock over → the right password works and the counter is cleared.
    await db.user.update({
      where: { id: u.id },
      data: { lockedUntil: new Date(Date.now() - 1000) },
    });
    expect(await auth.verifyCredentials({ email: u.email, password: u.password })).toMatchObject({
      id: u.id,
    });
    expect((await db.user.findUniqueOrThrow({ where: { id: u.id } })).failedLogins).toBe(0);
  });

  it("a successful login resets the count, so occasional typos never lock anyone", async () => {
    const u = await account();
    for (let round = 0; round < 3; round++) {
      for (let i = 0; i < auth.LOCK_AFTER_FAILURES - 1; i++)
        await auth.verifyCredentials({ email: u.email, password: "Typo2026" });
      expect(await auth.verifyCredentials({ email: u.email, password: u.password })).not.toBeNull();
    }
  });

  it("unknown emails answer like wrong passwords (no lock message that reveals accounts)", async () => {
    for (let i = 0; i < auth.LOCK_AFTER_FAILURES + 2; i++)
      expect(
        await auth.verifyCredentials({ email: `${RUN}-nobody@example.com`, password: "x" }),
      ).toBeNull();
  });
});

describe("password reset", () => {
  it("emails a 30-minute one-time link; using it changes the password, unlocks, and ends old sessions", async () => {
    const u = await account();
    await db.user.update({
      where: { id: u.id },
      data: { lockedUntil: new Date(Date.now() + 600_000) },
    });
    await pw.requestPasswordReset(u.email.toUpperCase());
    await runDueJobs();
    const mail = outbox.find((e) => e.to === u.email)!;
    const token = /token=([A-Za-z0-9_-]+)/.exec(mail.html)![1]!;
    const stored = await db.passwordResetToken.findFirstOrThrow({ where: { userId: u.id } });
    expect(stored.tokenHash).not.toContain(token);
    expect(stored.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(30 * 60_000);
    expect(await pw.resetTokenValid(token)).toBe(true);

    const before = Date.now();
    await pw.resetPassword(token, "Brandnew2026");
    const after = await db.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(after.lockedUntil).toBeNull();
    expect(after.passwordChangedAt!.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(
      await auth.verifyCredentials({ email: u.email, password: "Brandnew2026" }),
    ).not.toBeNull();
    expect(await auth.verifyCredentials({ email: u.email, password: u.password })).toBeNull();
    await expect(pw.resetPassword(token, "Another2026")).rejects.toThrow(
      /expired or was already used/,
    );
  });

  it("a newer request cancels older links; expired links fail; two uses at once → one wins", async () => {
    const u = await account();
    await pw.requestPasswordReset(u.email);
    await pw.requestPasswordReset(u.email);
    await runDueJobs();
    // The first email was skipped (its link was replaced before sending): only one link went out.
    const links = outbox
      .filter((e) => e.to === u.email)
      .map((e) => /token=([A-Za-z0-9_-]+)/.exec(e.html)![1]!);
    expect(links).toHaveLength(1);
    const results = await Promise.allSettled([
      pw.resetPassword(links[0]!, "Racer2026a"),
      pw.resetPassword(links[0]!, "Racer2026b"),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);

    await pw.requestPasswordReset(u.email);
    await runDueJobs();
    const fresh = /token=([A-Za-z0-9_-]+)/.exec(outbox.at(-1)!.html)![1]!;
    await db.passwordResetToken.updateMany({
      where: { userId: u.id, usedAt: null },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await pw.resetTokenValid(fresh)).toBe(false);
    await expect(pw.resetPassword(fresh, "Late2026xx")).rejects.toThrow(/expired/);
  });

  it("unknown emails: same outcome, nothing sent; junk tokens refused", async () => {
    await pw.requestPasswordReset(`${RUN}-ghost@example.com`);
    await runDueJobs();
    expect(outbox).toHaveLength(0);
    expect(await pw.resetTokenValid("x".repeat(40))).toBe(false);
    await expect(pw.resetPassword("' OR 1=1 --", "Whatever2026")).rejects.toThrow(/isn't valid/);
  });
});

describe("one customer can't reach another's data (IDOR)", () => {
  async function orderFor(userId: string, status: "PAID" | "DELIVERED" = "PAID") {
    return db.order.create({
      data: {
        userId,
        status,
        paidAt: new Date(),
        deliveredAt: status === "DELIVERED" ? new Date() : null,
        subtotalInPaise: 1000,
        totalInPaise: 1000,
        addressSnapshot: {
          fullName: "Owner",
          line1: "1",
          city: "Hyd",
          state: "Telangana",
          pincode: "500001",
          phone: "9876543210",
        },
      },
    });
  }

  it("orders and invoices", async () => {
    const me = await account();
    const them = await account();
    const order = await orderFor(me.id);
    expect(await orders.getOrderForUser(them.id, order.id)).toBeNull();
    expect(await orders.getOrderForUser(me.id, order.id)).not.toBeNull();
    await db.invoice.create({
      data: {
        orderId: order.id,
        number: `${RUN}/1`,
        financialYear: RUN,
        sequence: 1,
        snapshot: {},
      },
    });
    expect(await getInvoiceForViewer(order.id, { id: them.id, isAdmin: false })).toBeNull();
    expect(await getInvoiceForViewer(order.id, { id: me.id, isAdmin: false })).not.toBeNull();
  });

  it("cancelling or returning someone else's order is refused and changes nothing", async () => {
    const me = await account();
    const them = await account();
    const paid = await orderFor(me.id);
    await expect(
      returns.cancelPaidOrder({
        orderId: paid.id,
        by: "customer",
        actorId: them.id,
        userId: them.id,
      }),
    ).rejects.toThrow(/not found/i);
    expect((await db.order.findUniqueOrThrow({ where: { id: paid.id } })).status).toBe("PAID");
    const delivered = await orderFor(me.id, "DELIVERED");
    await expect(
      returns.requestReturn(them.id, delivered.id, { reason: "DAMAGED", items: [] }),
    ).rejects.toThrow(/not found/i);
    expect(await returns.getReturnOptions(them.id, delivered.id)).toBeNull();
  });

  it("addresses: read, change, delete, make default", async () => {
    const me = await account();
    const them = await account();
    const addr = await addresses.createAddress(me.id, {
      fullName: "Me",
      phone: "9876543210",
      line1: "1 Road",
      city: "Hyderabad",
      state: "Telangana",
      pincode: "500001",
    } as never);
    expect(await addresses.getAddressForUser(them.id, addr.id)).toBeNull();
    expect(await addresses.deleteAddress(them.id, addr.id)).toBe(false);
    expect(await addresses.setDefaultAddress(them.id, addr.id)).toBe(false);
    await addresses
      .updateAddress(them.id, addr.id, {
        fullName: "Hijacked",
        phone: "9876543210",
        line1: "x",
        city: "x",
        state: "Telangana",
        pincode: "500001",
      } as never)
      .catch(() => null);
    const after = await db.address.findUniqueOrThrow({ where: { id: addr.id } });
    // Stored encrypted (Phase 27); unchanged once decrypted.
    expect(after.fullName).toMatch(/^pii:v1:/);
    expect(decryptPii(after.fullName)).toBe("Me");
    expect(after.userId).toBe(me.id);
  });
});
