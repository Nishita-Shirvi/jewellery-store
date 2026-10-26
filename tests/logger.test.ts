import { afterEach, describe, expect, it, vi } from "vitest";
import { logger, setLogLevel } from "@/lib/logger";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));

function lastLine(spy: ReturnType<typeof vi.spyOn>) {
  return JSON.parse(String(spy.mock.calls.at(-1)?.[0]));
}

describe("logger", () => {
  afterEach(() => {
    setLogLevel("info");
    vi.restoreAllMocks();
  });

  it("writes one JSON line with event, level and fields", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    logger.info("order.paid", { orderId: "o1" });
    expect(lastLine(spy)).toMatchObject({ level: "info", event: "order.paid", orderId: "o1" });
  });

  it("hides secret-looking keys, even nested", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    logger.warn("x", { password: "p", nested: { apiKey: "k", authorization: "a" }, ok: 1 });
    expect(lastLine(spy)).toMatchObject({
      password: "[redacted]",
      nested: { apiKey: "[redacted]", authorization: "[redacted]" },
      ok: 1,
    });
  });

  it("keeps the message and stack of errors", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logger.error("boom", { error: new Error("db down") });
    const line = lastLine(spy);
    expect(line.error.message).toBe("db down");
    expect(line.error.stack).toContain("Error: db down");
  });

  it("drops lines below the configured level", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    logger.debug("hidden");
    expect(spy).not.toHaveBeenCalled();
    setLogLevel("debug");
    logger.debug("shown");
    expect(spy).toHaveBeenCalledOnce();
  });

  it("child loggers add their fields to every line", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    logger.child({ module: "checkout" }).info("start", { orderId: "o2" });
    expect(lastLine(spy)).toMatchObject({ module: "checkout", orderId: "o2" });
  });
});
