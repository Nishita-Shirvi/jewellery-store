import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/** Phase 22 — support tickets, private attachments, FAQs against real PostgreSQL. */

process.env.RESEND_API_KEY = "re_test_key_support";
process.env.EMAIL_FROM = "Store <help@example.com>";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
  unstable_cache: <T>(fn: T) => fn,
}));

const outbox = vi.hoisted(() => [] as { to: string; subject: string; html: string }[]);
vi.stubGlobal("fetch", async (url: string, init?: { body?: string }) => {
  if (String(url).startsWith("https://api.resend.com")) {
    outbox.push(JSON.parse(init?.body ?? "{}"));
    return new Response("{}", { status: 200 });
  }
  return new Response("{}", { status: 500 });
});

const { db } = await import("@/lib/db");
const s = await import("@/services/support.service");
const { runDueJobs } = await import("@/services/jobs.service");
const { REPLY_DUE_MS } = await import("@/lib/support");

const RUN = `sp${Date.now().toString(36)}`;
const ids: string[] = [];
let n = 0;

async function user(roleKeys: string[] = []) {
  const u = await db.user.create({
    data: {
      email: `${RUN}-${++n}@example.com`,
      name: `Person ${n}`,
      role: roleKeys.length ? "ADMIN" : "CUSTOMER",
    },
  });
  ids.push(u.id);
  for (const key of roleKeys) {
    const role = await db.staffRole.findUniqueOrThrow({ where: { key } });
    await db.userRole.create({ data: { userId: u.id, roleId: role.id } });
  }
  return u;
}

const png = () =>
  new File(
    [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])],
    "clasp.png",
    {
      type: "image/png",
    },
  );

async function ticketFor(customerId: string, files: File[] = []) {
  return s.createTicket(customerId, {
    subject: "The clasp is loose",
    category: "PRODUCT",
    body: "The clasp on my bracelet came loose after a day.",
    files: await s.readAttachments(files),
  });
}

beforeAll(async () => {
  await db.job.deleteMany({});
});
beforeEach(() => {
  outbox.length = 0;
});
afterAll(async () => {
  await db.job.deleteMany({});
  await db.faq.deleteMany({ where: { question: { startsWith: RUN } } });
  await db.order.deleteMany({ where: { userId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  await db.$disconnect();
});

describe("customers only reach their own tickets", () => {
  it("another customer can't read, reply to or close my ticket — and nothing is written", async () => {
    const me = await user();
    const them = await user();
    const ticketId = await ticketFor(me.id);
    expect(await s.getTicketForUser(them.id, ticketId)).toBeNull();
    await expect(s.customerReply(them.id, ticketId, "let me in", [])).rejects.toThrow(/not found/);
    expect(await s.customerResolve(them.id, ticketId)).toBe(false);
    expect(await db.ticketMessage.count({ where: { ticketId } })).toBe(1);
    expect((await db.supportTicket.findUniqueOrThrow({ where: { id: ticketId } })).status).toBe(
      "OPEN",
    );
  });

  it("a ticket can't be linked to someone else's order", async () => {
    const me = await user();
    const them = await user();
    const order = await db.order.create({
      data: {
        userId: them.id,
        status: "PAID",
        subtotalInPaise: 1,
        totalInPaise: 1,
        addressSnapshot: {},
      },
    });
    await expect(
      s.createTicket(me.id, {
        subject: "Where is it?",
        category: "ORDER",
        orderId: order.id,
        body: "Hello there",
        files: [],
      }),
    ).rejects.toThrow(/isn't on your account/);
  });

  it("subject and message are checked", async () => {
    const me = await user();
    await expect(
      s.createTicket(me.id, { subject: "x", category: "OTHER", body: "Hello there", files: [] }),
    ).rejects.toThrow(/short title/);
    await expect(
      s.createTicket(me.id, {
        subject: "Fine subject",
        category: "OTHER",
        body: "x".repeat(5001),
        files: [],
      }),
    ).rejects.toThrow(/5000/);
  });
});

describe("conversation", () => {
  it("reply → ANSWERED and emailed; internal note → hidden and not emailed; customer reply reopens", async () => {
    const me = await user();
    const agent = await user(["SUPPORT"]);
    const ticketId = await ticketFor(me.id);
    await runDueJobs(); // staff alert for the new ticket

    await s.staffReply(agent.id, ticketId, {
      body: "Customer looks genuine — replace it.",
      internal: true,
      resolve: false,
      files: [],
    });
    let t = await db.supportTicket.findUniqueOrThrow({ where: { id: ticketId } });
    expect(t.status).toBe("OPEN");
    const mine = await s.getTicketForUser(me.id, ticketId);
    expect(mine!.messages.map((m) => m.body)).not.toContain("Customer looks genuine — replace it.");

    outbox.length = 0;
    await s.staffReply(agent.id, ticketId, {
      body: "Sorry! We'll send a new clasp.",
      internal: false,
      resolve: true,
      files: [],
    });
    t = await db.supportTicket.findUniqueOrThrow({ where: { id: ticketId } });
    expect(t).toMatchObject({ status: "RESOLVED" });
    await runDueJobs();
    expect(outbox.filter((e) => e.to === me.email)).toHaveLength(1);
    expect(outbox[0]!.html).toContain("send a new clasp");
    expect(outbox[0]!.html).not.toContain("genuine"); // internal note never emailed

    await s.customerReply(me.id, ticketId, "Actually the stone is loose too", []);
    t = await db.supportTicket.findUniqueOrThrow({ where: { id: ticketId } });
    expect(t).toMatchObject({ status: "OPEN", resolvedAt: null });
  });

  it("customer messages alert the assigned agent (or the store's support address)", async () => {
    const me = await user();
    const agent = await user(["ORDER_MANAGER"]);
    const ticketId = await ticketFor(me.id);
    await runDueJobs();
    expect(outbox.some((e) => e.subject.startsWith("[Support]"))).toBe(true);
    outbox.length = 0;
    await s.assignTicket(ticketId, agent.id);
    await s.customerReply(me.id, ticketId, "Any news?", []);
    await runDueJobs();
    expect(outbox.map((e) => e.to)).toEqual([agent.email]);
  });

  it("tickets can only be assigned to active staff who do support", async () => {
    const me = await user();
    const editor = await user(["CATALOG_EDITOR"]);
    const customer = await user();
    const ticketId = await ticketFor(me.id);
    await expect(s.assignTicket(ticketId, editor.id)).rejects.toThrow(/can't work on support/);
    await expect(s.assignTicket(ticketId, customer.id)).rejects.toThrow(/can't work on support/);
  });
});

describe("attachments are private", () => {
  it("only real photos/PDFs, max 2, max 2 MB", async () => {
    const disguised = new File(
      [new TextEncoder().encode("<svg><script>alert(1)</script></svg>")],
      "cute.png",
      { type: "image/png" },
    );
    await expect(s.readAttachments([disguised])).rejects.toThrow(/Only photos/);
    await expect(s.readAttachments([png(), png(), png()])).rejects.toThrow(/up to 2/);
    const big = new File([new Uint8Array(2 * 1024 * 1024 + 1)], "big.png");
    await expect(s.readAttachments([big])).rejects.toThrow(/2 MB/);
    const ok = await s.readAttachments([png(), new File([], "empty.png")]);
    expect(ok.map((f) => [f.filename, f.contentType])).toEqual([["clasp.png", "image/png"]]);
  });

  it("the owner and support staff can open it; other customers can't; internal-note files stay internal", async () => {
    const me = await user();
    const them = await user();
    const agent = await user(["SUPPORT"]);
    const ticketId = await ticketFor(me.id, [png()]);
    const att = await db.ticketAttachment.findFirstOrThrow({ where: { ticketId } });
    expect(
      (await s.getAttachmentForViewer(att.id, { id: me.id, isSupportStaff: false }))?.contentType,
    ).toBe("image/png");
    expect(
      await s.getAttachmentForViewer(att.id, { id: them.id, isSupportStaff: false }),
    ).toBeNull();
    expect(
      await s.getAttachmentForViewer(att.id, { id: agent.id, isSupportStaff: true }),
    ).not.toBeNull();

    await s.staffReply(agent.id, ticketId, {
      body: "Photo of the replacement batch",
      internal: true,
      resolve: false,
      files: await s.readAttachments([png()]),
    });
    const internal = await db.ticketAttachment.findFirstOrThrow({
      where: { ticketId, message: { internal: true } },
    });
    expect(
      await s.getAttachmentForViewer(internal.id, { id: me.id, isSupportStaff: false }),
    ).toBeNull();
  });
});

describe("inbox", () => {
  it("customers waiting over 24 h come first and are flagged; filters work", async () => {
    const me = await user();
    const agent = await user(["SUPPORT"]);
    const fresh = await ticketFor(me.id);
    const old = await ticketFor(me.id);
    await db.supportTicket.update({
      where: { id: old },
      data: { lastCustomerMessageAt: new Date(Date.now() - REPLY_DUE_MS - 60_000) },
    });
    const all = await s.listTicketsAdmin({ who: "all" }, agent.id);
    const mine = all.filter((t) => [fresh, old].includes(t.id));
    expect(mine.map((t) => [t.id, t.overdue])).toEqual([
      [old, true],
      [fresh, false],
    ]);
    expect(all.findIndex((t) => t.id === old)).toBeLessThan(all.findIndex((t) => t.id === fresh));
    await s.assignTicket(fresh, agent.id);
    expect((await s.listTicketsAdmin({ who: "me" }, agent.id)).map((t) => t.id)).toEqual([fresh]);
    expect((await s.listTicketsAdmin({ who: "unassigned" }, agent.id)).map((t) => t.id)).toContain(
      old,
    );
  });
});

describe("help centre search", () => {
  it("finds published answers by every word (question, answer or category); hides drafts", async () => {
    await s.saveFaq({
      question: `${RUN} How long does delivery take?`,
      answer: "3 to 5 working days, insured.",
      category: "Delivery",
      position: 0,
      isPublished: true,
    });
    await s.saveFaq({
      question: `${RUN} Draft about delivery`,
      answer: "secret",
      category: "Delivery",
      position: 1,
      isPublished: false,
    });
    const hits = await s.publishedFaqs(`${RUN} insured`);
    expect(hits.map((f) => f.question)).toEqual([`${RUN} How long does delivery take?`]);
    expect((await s.publishedFaqs(`${RUN} draft`)).length).toBe(0);
    expect((await s.publishedFaqs(`${RUN} nothingmatches`)).length).toBe(0);
    expect((await s.publishedFaqs(`${RUN}' OR 1=1 --`)).length).toBe(0);
  });
});
