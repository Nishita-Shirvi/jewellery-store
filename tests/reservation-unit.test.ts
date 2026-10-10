import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: {} }));

const { availableStock, reservationDeadline, RESERVATION_MINUTES } =
  await import("@/services/inventory.service");
const { isAuthorizedCron } = await import("@/lib/cron-auth");

describe("availableStock", () => {
  it("is stock minus held units, never negative", () => {
    expect(availableStock({ stock: 5, reservedStock: 2 })).toBe(3);
    expect(availableStock({ stock: 1, reservedStock: 1 })).toBe(0);
    expect(availableStock({ stock: 1, reservedStock: 3 })).toBe(0);
  });
});

describe("reservationDeadline", () => {
  it("is 15 minutes from now", () => {
    const now = new Date("2026-10-09T10:00:00Z");
    expect(RESERVATION_MINUTES).toBe(15);
    expect(reservationDeadline(now).toISOString()).toBe("2026-10-09T10:15:00.000Z");
  });
});

describe("isAuthorizedCron", () => {
  const secret = "a-very-long-cron-secret";
  it("accepts only the exact bearer secret", () => {
    expect(isAuthorizedCron(`Bearer ${secret}`, secret)).toBe(true);
    expect(isAuthorizedCron(`Bearer ${secret}x`, secret)).toBe(false);
    expect(isAuthorizedCron(secret, secret)).toBe(false);
    expect(isAuthorizedCron(null, secret)).toBe(false);
    expect(isAuthorizedCron(`Bearer ${secret}`, undefined)).toBe(false);
  });
});
