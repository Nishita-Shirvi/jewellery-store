import { describe, expect, it } from "vitest";
import {
  REMINDER_MAX_AGE_MS,
  decodeEmail,
  dueReminderStep,
  encodeEmail,
  randomCode,
  signEmailLink,
  verifyEmailLink,
} from "@/lib/marketing";

const MIN = 60_000;
const rules = { firstAfterMs: 60 * MIN, secondAfterMs: 24 * 60 * MIN };
const t0 = new Date("2026-11-03T10:00:00Z");
const at = (minutes: number) => new Date(t0.getTime() + minutes * MIN);
const base = {
  lastActivity: t0,
  sent: [] as { step: number; sentAt: Date }[],
  orderedSince: false,
  unsubscribed: false,
  rules,
};

describe("cart reminder timing", () => {
  it("nothing before an hour, first reminder after an hour", () => {
    expect(dueReminderStep({ ...base, now: at(59) })).toBe(0);
    expect(dueReminderStep({ ...base, now: at(60) })).toBe(1);
  });

  it("second only after a day AND after the first one, never twice", () => {
    const sent1 = [{ step: 1, sentAt: at(61) }];
    expect(dueReminderStep({ ...base, sent: sent1, now: at(23 * 60) })).toBe(0);
    expect(dueReminderStep({ ...base, sent: sent1, now: at(24 * 60 + 1) })).toBe(2);
    expect(
      dueReminderStep({
        ...base,
        sent: [...sent1, { step: 2, sentAt: at(24 * 60 + 2) }],
        now: at(30 * 60),
      }),
    ).toBe(0);
  });

  it("scheduler was down for 2 days: sends the first now, and NOT the second right after it", () => {
    const now = at(48 * 60);
    expect(dueReminderStep({ ...base, now })).toBe(1);
    const sent1 = [{ step: 1, sentAt: now }];
    expect(dueReminderStep({ ...base, sent: sent1, now: at(48 * 60 + 10) })).toBe(0);
    // …but it does follow once the planned gap (23 h) has passed since the first.
    expect(dueReminderStep({ ...base, sent: sent1, now: at(48 * 60 + 23 * 60) })).toBe(2);
  });

  it("stops after an order, after unsubscribing, and for carts older than 7 days", () => {
    expect(dueReminderStep({ ...base, orderedSince: true, now: at(120) })).toBe(0);
    expect(dueReminderStep({ ...base, unsubscribed: true, now: at(120) })).toBe(0);
    expect(
      dueReminderStep({ ...base, now: new Date(t0.getTime() + REMINDER_MAX_AGE_MS + MIN) }),
    ).toBe(0);
  });

  it("works with short test timers (1 min / 5 min)", () => {
    const short = { firstAfterMs: MIN, secondAfterMs: 5 * MIN };
    expect(dueReminderStep({ ...base, rules: short, now: at(1) })).toBe(1);
    expect(
      dueReminderStep({ ...base, rules: short, sent: [{ step: 1, sentAt: at(1) }], now: at(5) }),
    ).toBe(2);
  });
});

describe("signed unsubscribe links", () => {
  const secret = "test-secret-0123456789-abcdefghij";
  it("accepts its own link (any letter case in the email)", () => {
    const t = signEmailLink("Priya@Example.com", "unsubscribe", secret);
    expect(verifyEmailLink("priya@example.com", "unsubscribe", t, secret)).toBe(true);
  });
  it("can't be reused for another email, another purpose, or with another key", () => {
    const t = signEmailLink("priya@example.com", "unsubscribe", secret);
    expect(verifyEmailLink("someone@example.com", "unsubscribe", t, secret)).toBe(false);
    expect(verifyEmailLink("priya@example.com", "confirm", t, secret)).toBe(false);
    expect(verifyEmailLink("priya@example.com", "unsubscribe", t, `${secret}x`)).toBe(false);
    expect(verifyEmailLink("priya@example.com", "unsubscribe", "short", secret)).toBe(false);
    expect(verifyEmailLink("priya@example.com", "unsubscribe", "", secret)).toBe(false);
  });
  it("email round-trips through the link, junk doesn't decode", () => {
    expect(decodeEmail(encodeEmail("Priya@Example.com"))).toBe("priya@example.com");
    for (const junk of ["", "%%%", Buffer.from("not an email").toString("base64url")])
      expect(decodeEmail(junk)).toBeNull();
  });
});

describe("codes", () => {
  it("use only easy-to-read characters (no 0/O, 1/I/L)", () => {
    const many = Array.from({ length: 200 }, () => randomCode(8)).join("");
    expect(many).toMatch(/^[A-HJKMNP-Z2-9]+$/);
    expect(new Set(Array.from({ length: 200 }, () => randomCode(8))).size).toBe(200);
  });
});
