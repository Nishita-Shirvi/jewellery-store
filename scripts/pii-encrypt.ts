/**
 * Encrypts customers' phone numbers and addresses that are still in plain text (rows saved before
 * Phase 27), and re-encrypts everything after a key change (PII_PREVIOUS_KEY → PII_ENCRYPTION_KEY).
 *
 *   npm run pii:encrypt            # do it
 *   npm run pii:encrypt -- --dry   # only count what would change
 *
 * Safe to run any number of times, and while the store is open: the app reads plain-text and
 * encrypted values alike. Needs DATABASE_URL and the same keys as the app (AUTH_SECRET,
 * PII_ENCRYPTION_KEY, PII_PREVIOUS_KEY if rotating).
 */
import { PrismaClient, type Prisma } from "@prisma/client";
import { PII_ADDRESS_FIELDS, decryptPii, encryptPii, needsReencrypt } from "../lib/pii";

const db = new PrismaClient();
const dry = process.argv.includes("--dry");
const BATCH = 200;

type Fields = Partial<Record<(typeof PII_ADDRESS_FIELDS)[number], string | null>>;

/** Returns the re-encrypted fields that changed, or null when nothing needs doing. */
function reencrypt(row: Fields): Fields | null {
  const out: Fields = {};
  for (const f of PII_ADDRESS_FIELDS) {
    const v = row[f];
    if (typeof v === "string" && needsReencrypt(v)) out[f] = encryptPii(decryptPii(v));
  }
  return Object.keys(out).length ? out : null;
}

async function addresses() {
  let changed = 0;
  for (let cursor: string | undefined; ;) {
    const rows = await db.address.findMany({
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      select: { id: true, fullName: true, phone: true, line1: true, line2: true, landmark: true },
    });
    if (rows.length === 0) break;
    for (const r of rows) {
      const data = reencrypt(r);
      if (!data) continue;
      changed++;
      if (!dry)
        await db.address.update({ where: { id: r.id }, data: data as Prisma.AddressUpdateInput });
    }
    cursor = rows.at(-1)!.id;
  }
  return changed;
}

async function orderSnapshots() {
  let changed = 0;
  for (let cursor: string | undefined; ;) {
    const rows = await db.order.findMany({
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      select: { id: true, addressSnapshot: true },
    });
    if (rows.length === 0) break;
    for (const r of rows) {
      const snap = (r.addressSnapshot ?? {}) as Fields & Record<string, unknown>;
      const data = reencrypt(snap);
      if (!data) continue;
      changed++;
      if (!dry)
        await db.order.update({
          where: { id: r.id },
          data: { addressSnapshot: { ...snap, ...data } as Prisma.InputJsonValue },
        });
    }
    cursor = rows.at(-1)!.id;
  }
  return changed;
}

async function otpPhones() {
  let changed = 0;
  const rows = await db.otpChallenge.findMany({ select: { id: true, phone: true } });
  for (const r of rows) {
    if (!needsReencrypt(r.phone)) continue;
    changed++;
    if (!dry)
      await db.otpChallenge.update({
        where: { id: r.id },
        data: { phone: encryptPii(decryptPii(r.phone)) },
      });
  }
  return changed;
}

/** Invoices keep the buyer's name, phone, email and address (Phase 29: encrypted too). */
async function invoiceBuyers() {
  let changed = 0;
  for (let cursor: string | undefined; ;) {
    const rows = await db.invoice.findMany({
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      select: { id: true, snapshot: true },
    });
    if (rows.length === 0) break;
    for (const r of rows) {
      const snap = r.snapshot as { buyer?: Record<string, string> } & Record<string, unknown>;
      const buyer = snap.buyer ?? {};
      const next = { ...buyer };
      let touched = false;
      for (const f of ["name", "phone", "email", "address"]) {
        const v = buyer[f];
        if (typeof v === "string" && needsReencrypt(v)) {
          next[f] = encryptPii(decryptPii(v));
          touched = true;
        }
      }
      if (!touched) continue;
      changed++;
      if (!dry)
        await db.invoice.update({
          where: { id: r.id },
          data: { snapshot: { ...snap, buyer: next } as Prisma.InputJsonValue },
        });
    }
    cursor = rows.at(-1)!.id;
  }
  return changed;
}

async function main() {
  const result = {
    addresses: await addresses(),
    orderAddresses: await orderSnapshots(),
    codePhones: await otpPhones(),
    invoiceBuyers: await invoiceBuyers(),
  };
  console.log(`${dry ? "Would encrypt" : "Encrypted"}:`, result);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
