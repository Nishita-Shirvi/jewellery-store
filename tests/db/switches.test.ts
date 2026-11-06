import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Kill switches (Phase 30) against a real database: pausing is enforced on the server (coupon
 * checks, COD quotes and orders, payments), checkout pauses COD too, and turning a switch back
 * on restores everything. Other instances pick up a change within SWITCH_TTL_MS.
 */

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
  unstable_cache: <T>(fn: T) => fn,
}));

const { db } = await import("@/lib/db");
const sw = await import("@/services/switches.service");
const { checkCoupon } = await import("@/services/coupon.service");
const orders = await import("@/services/order.service");

const RUN = `sw${Date.now().toString(36)}`;
const buyer = { id: `${RUN}-nobody`, email: null, name: null };

async function reset() {
  await db.appSetting.deleteMany({ where: { key: "switches" } });
  sw.clearSwitchCache();
}
beforeEach(reset);
afterAll(async () => {
  await reset();
  await db.$disconnect();
});

describe("kill switches", () => {
  it("everything is on by default", async () => {
    const s = await sw.getSwitches();
    expect(sw.SWITCH_KEYS.every((k) => s[k].off === false)).toBe(true);
    expect(await sw.pausedMessage("coupons")).toBeNull();
  });

  it("coupons paused → every coupon check is refused; back on → normal answer", async () => {
    await sw.setSwitch("coupons", true, "owner@example.com", "abuse");
    const r = await checkCoupon("ANYTHING", buyer.id, 100_000);
    expect(r).toEqual({ ok: false, error: sw.SWITCHES.coupons.paused });
    const s = await sw.getSwitches();
    expect(s.coupons).toMatchObject({ off: true, by: "owner@example.com", note: "abuse" });

    await sw.setSwitch("coupons", false, "owner@example.com");
    const back = await checkCoupon("ANYTHING", buyer.id, 100_000);
    expect(back.ok === false && back.error).not.toBe(sw.SWITCHES.coupons.paused);
  });

  it("COD paused → quotes and orders refused before anything else is looked at", async () => {
    await sw.setSwitch("cod", true, "owner");
    expect(await orders.quoteCod(buyer, { addressId: "x" })).toEqual({
      ok: false,
      reason: sw.SWITCHES.cod.paused,
    });
    expect(await orders.placeCodOrder(buyer, { addressId: "x", checkoutKey: `${RUN}-k1` })).toEqual(
      { ok: false, error: sw.SWITCHES.cod.paused },
    );
  });

  it("checkout paused → payments and COD both stop; the other switches are untouched", async () => {
    await sw.setSwitch("checkout", true, "owner");
    expect(await orders.resumePayment(buyer, "x")).toEqual({
      ok: false,
      error: sw.SWITCHES.checkout.paused,
    });
    expect(await orders.quoteCod(buyer, { addressId: "x" })).toEqual({
      ok: false,
      reason: sw.SWITCHES.checkout.paused,
    });
    const s = await sw.getSwitches();
    expect([s.cod.off, s.coupons.off, s.recommendations.off]).toEqual([false, false, false]);
  });

  it("another server sees a change within the cache time", async () => {
    expect(await sw.isOff("recommendations")).toBe(false);
    // Written by "another instance": straight into the table, this process's copy untouched.
    await db.appSetting.create({
      data: { key: "switches", value: { recommendations: { off: true } } },
    });
    expect(await sw.isOff("recommendations")).toBe(false); // still cached
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + sw.SWITCH_TTL_MS + 1);
    expect(await sw.isOff("recommendations")).toBe(true);
    vi.useRealTimers();
  });

  it("an unreadable or odd setting never pauses anything by itself", async () => {
    await db.appSetting.create({ data: { key: "switches", value: "garbage" } });
    const s = await sw.getSwitches();
    expect(sw.SWITCH_KEYS.every((k) => s[k].off === false)).toBe(true);
  });
});
