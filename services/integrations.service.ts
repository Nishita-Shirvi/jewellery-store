import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { decryptPii, encryptPii } from "@/lib/pii";
import { AdminInputError } from "@/services/admin/product-admin.service";

/**
 * Integrations (Phase 29): read-only API keys for the public Products API, and outgoing webhooks
 * (signed order events to the owner's other systems — accounting, ERP, a WhatsApp tool…).
 */

// ───────────────────────── API keys ─────────────────────────

const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

/** Creates a key; the full key is returned ONCE (only its hash is stored). */
export async function createApiKey(name: string, createdById: string) {
  const key = `sk_live_${randomBytes(24).toString("base64url")}`;
  const row = await db.apiKey.create({
    data: { name: name.slice(0, 80), prefix: key.slice(0, 14), keyHash: hashKey(key), createdById },
    select: { id: true, name: true, prefix: true },
  });
  logger.info("integrations.api_key_created", { keyId: row.id, createdById });
  return { ...row, key };
}

export async function revokeApiKey(id: string) {
  await db.apiKey.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function listApiKeys() {
  return db.apiKey.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      prefix: true,
      lastUsedAt: true,
      revokedAt: true,
      createdAt: true,
    },
  });
}

/** "Authorization: Bearer sk_live_…" → the key's id, or null. Constant-time hash comparison. */
export async function authenticateApiKey(header: string | null): Promise<string | null> {
  const key = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!/^sk_live_[A-Za-z0-9_-]{20,64}$/.test(key)) return null;
  const hash = hashKey(key);
  const row = await db.apiKey.findUnique({
    where: { keyHash: hash },
    select: { id: true, keyHash: true, revokedAt: true, lastUsedAt: true },
  });
  if (!row || row.revokedAt) return null;
  if (!timingSafeEqual(Buffer.from(row.keyHash), Buffer.from(hash))) return null;
  // Remember use at most once a minute (not a write per request).
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60_000)
    await db.apiKey
      .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);
  return row.id;
}

// ───────────────────────── outgoing webhooks ─────────────────────────

export const WEBHOOK_EVENTS = [
  "order.confirmed",
  "order.shipped",
  "order.delivered",
  "order.cancelled",
  "order.refunded",
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

/**
 * Only public https addresses: never localhost or private networks (a webhook URL must not be a
 * way to make our server call internal services).
 */
export function safeWebhookUrl(value: string): string | null {
  let u: URL;
  try {
    u = new URL(value.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.username || u.password) return null;
  const h = u.hostname.toLowerCase();
  if (
    h === "localhost" ||
    h.endsWith(".localhost") ||
    h.endsWith(".local") ||
    h.endsWith(".internal")
  )
    return null;
  if (/^\[?[0-9a-f:]+\]?$/.test(h) && h.includes(":")) return null; // IPv6 literals
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    )
      return null;
  }
  return u.toString();
}

export async function createWebhookEndpoint(url: string, events: string[]) {
  const safe = safeWebhookUrl(url);
  if (!safe)
    throw new AdminInputError(
      "Use a public https:// address (not localhost or a private network).",
    );
  const chosen = events.filter((e): e is WebhookEvent =>
    (WEBHOOK_EVENTS as readonly string[]).includes(e),
  );
  const secret = `whsec_${randomBytes(24).toString("base64url")}`;
  const row = await db.webhookEndpoint.create({
    data: { url: safe, events: chosen, secret: encryptPii(secret) },
    select: { id: true, url: true },
  });
  return { ...row, secret };
}

export async function setWebhookActive(id: string, active: boolean) {
  await db.webhookEndpoint.updateMany({ where: { id }, data: { active } });
}

export async function deleteWebhookEndpoint(id: string) {
  await db.webhookEndpoint.deleteMany({ where: { id } });
}

export async function listWebhookEndpoints() {
  return db.webhookEndpoint.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, url: true, events: true, active: true, createdAt: true },
  });
}

/**
 * Queues one delivery per subscribed endpoint (inside the caller's transaction when given), so
 * an event is never sent for a change that was rolled back. Delivery is a background job:
 * retried with backoff, and visible in Admin → Jobs if the receiver keeps failing.
 */
export async function emitWebhook(
  event: WebhookEvent,
  data: Record<string, unknown>,
  tx?: Prisma.TransactionClient,
) {
  const client = tx ?? db;
  const endpoints = await client.webhookEndpoint.findMany({
    where: { active: true },
    select: { id: true, events: true },
  });
  const targets = endpoints.filter((e) => e.events.length === 0 || e.events.includes(event));
  if (targets.length === 0) return 0;
  const { enqueue } = await import("@/services/jobs.service");
  const id = `evt_${randomBytes(12).toString("hex")}`;
  const createdAt = new Date().toISOString();
  for (const t of targets)
    await enqueue(
      "webhook.outgoing",
      { endpointId: t.id, id, event, createdAt, data } as Prisma.InputJsonValue,
      { tx, maxAttempts: 8 },
    );
  return targets.length;
}

/** "t=<unix seconds>,v1=<hex HMAC-SHA256 of `${t}.${body}`>" — receivers check it with the secret. */
export function signWebhook(secret: string, body: string, t = Math.floor(Date.now() / 1000)) {
  return `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;
}

/** Sends one queued webhook (the job). Throws on failure so the job retries. */
export async function deliverWebhook(p: {
  endpointId: string;
  id: string;
  event: string;
  createdAt: string;
  data: unknown;
}) {
  const endpoint = await db.webhookEndpoint.findUnique({ where: { id: p.endpointId } });
  if (!endpoint || !endpoint.active) return; // removed or paused since: nothing to send
  const url = safeWebhookUrl(endpoint.url);
  if (!url) throw new Error("Webhook URL is no longer allowed");
  const body = JSON.stringify({ id: p.id, event: p.event, createdAt: p.createdAt, data: p.data });
  const res = await fetch(url, {
    method: "POST",
    redirect: "error", // never follow a redirect to somewhere else
    headers: {
      "content-type": "application/json",
      "user-agent": "jewellery-store-webhooks/1",
      "x-store-event": p.event,
      "x-store-delivery": p.id,
      "x-store-signature": signWebhook(decryptPii(endpoint.secret), body),
    },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Webhook ${url} responded ${res.status}`);
}
