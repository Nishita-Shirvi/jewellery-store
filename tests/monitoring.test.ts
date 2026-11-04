import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: {} }));

import { logger } from "@/lib/logger";
import { requestIdFrom, runWithContext } from "@/lib/request-context";
import { ALERTS, ALERT_KEYS } from "@/services/monitor.service";

/** Phase 26 — correlation ids, and every alert has a runbook entry. */

afterEach(() => vi.restoreAllMocks());

describe("request ids", () => {
  it("reuses Vercel's id; makes one when missing; refuses ids that could inject log lines", () => {
    expect(requestIdFrom(new Headers({ "x-vercel-id": "bom1::abc12-1730000000-xyz" }))).toBe(
      "bom1::abc12-1730000000-xyz",
    );
    const made = requestIdFrom(new Headers());
    expect(made).toMatch(/^[0-9a-f-]{36}$/);
    const injected = requestIdFrom(new Headers({ "x-request-id": 'x" , "level":"error' }));
    expect(injected).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("every log line inside a request or job carries its ids", () => {
    const lines: string[] = [];
    vi.spyOn(console, "info").mockImplementation((l: string) => void lines.push(l));
    runWithContext({ requestId: "req-123456", jobId: "job-1", jobType: "email.order" }, () =>
      logger.info("test.inside", { orderId: "o1" }),
    );
    logger.info("test.outside");
    const inside = lines.find((l) => l.includes("test.inside"))!;
    expect(inside).toContain("req-123456");
    expect(inside).toContain("job-1");
    expect(inside).toContain("o1");
    expect(lines.find((l) => l.includes("test.outside"))).not.toContain("req-123456");
  });

  it("a field can't overwrite the request id by accident (explicit fields win, ids still there)", () => {
    const lines: string[] = [];
    vi.spyOn(console, "info").mockImplementation((l: string) => void lines.push(l));
    runWithContext({ requestId: "req-abcdef" }, () => logger.info("test.override", { other: 1 }));
    expect(lines.at(-1)).toContain("req-abcdef");
  });
});

describe("runbook", () => {
  /** GitHub's heading anchor: lower-case, punctuation dropped, spaces → dashes. */
  const slug = (h: string) =>
    h
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      .replace(/\s/g, "-");
  const runbook = readFileSync("Docs/RUNBOOK.md", "utf8");
  const anchors = new Set(
    runbook
      .split("\n")
      .filter((l) => l.startsWith("## "))
      .map((l) => slug(l.slice(3))),
  );

  it.each(ALERT_KEYS)("alert %s has a runbook section it links to", (key) => {
    expect(anchors).toContain(ALERTS[key].runbook);
    expect(runbook).toContain(`## ${ALERTS[key].title}`);
  });

  it("every section says what it means, what to check and how to fix it", () => {
    for (const key of ALERT_KEYS) {
      const start = runbook.indexOf(`## ${ALERTS[key].title}`);
      const section = runbook.slice(start, runbook.indexOf("\n## ", start + 3));
      expect(section).toContain("**Means:**");
      expect(section).toContain("**Check first:**");
      expect(section).toContain("**Fix:**");
    }
  });
});
