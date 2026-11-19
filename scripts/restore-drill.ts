/**
 * Backup restore drill (Phase 30): proves a backup can actually be restored, and how long it
 * takes. Never writes to the source database.
 *
 *   npm run backup:drill                         # source = DIRECT_URL; restores into a new
 *                                                # "<db>_restore_drill" database on the same server
 *   npm run backup:drill -- --target "<url>"     # restore into this (empty) database instead —
 *                                                # e.g. a fresh Neon branch
 *   npm run backup:drill -- --keep               # keep the dump file and restored database
 *
 * Steps: pg_dump (custom format) → create/clean target → pg_restore → compare the row count of
 * every table and the newest order / invoice → print timings. Exit code 1 if anything differs.
 * Needs the PostgreSQL client tools (pg_dump, pg_restore) on PATH, or PG_BIN pointing at them.
 * Record each run's result in Docs/BACKUPS.md → "Drill log".
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const args = process.argv.slice(2);
const keep = args.includes("--keep");
const targetArg = args.includes("--target") ? args[args.indexOf("--target") + 1] : undefined;
const source = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!source) throw new Error("Set DIRECT_URL (or DATABASE_URL) to the database to back up.");

const bin = (name: string) =>
  process.env.PG_BIN
    ? path.join(process.env.PG_BIN, process.platform === "win32" ? `${name}.exe` : name)
    : name;
const hidePassword = (url: string) => url.replace(/\/\/([^:/]+):[^@]+@/, "//$1:***@");

function withDatabase(url: string, db: string) {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
}

async function tableCounts(url: string) {
  const client = new PrismaClient({ datasourceUrl: url });
  try {
    const tables = await client.$queryRawUnsafe<{ t: string }[]>(
      `select table_name as t from information_schema.tables
       where table_schema = 'public' and table_type = 'BASE TABLE' order by 1`,
    );
    const counts: Record<string, number> = {};
    for (const { t } of tables) {
      const [row] = await client.$queryRawUnsafe<{ n: bigint }[]>(
        `select count(*)::bigint as n from "${t.replace(/"/g, '""')}"`,
      );
      counts[t] = Number(row!.n);
    }
    const [latest] = await client.$queryRawUnsafe<{ o: Date | null; i: string | null }[]>(
      `select (select max("createdAt") from "Order") as o,
              (select "number" from "Invoice" order by "createdAt" desc limit 1) as i`,
    );
    return {
      counts,
      latestOrder: latest?.o?.toISOString() ?? null,
      latestInvoice: latest?.i ?? null,
    };
  } finally {
    await client.$disconnect();
  }
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

async function main() {
  const work = mkdtempSync(path.join(tmpdir(), "restore-drill-"));
  const dump = path.join(work, "backup.dump");
  const sourceDb = new URL(source!).pathname.slice(1);
  const drillDb = `${sourceDb}_restore_drill`;
  const target = targetArg ?? withDatabase(source!, drillDb);
  if (
    new URL(target).pathname === new URL(source!).pathname &&
    new URL(target).host === new URL(source!).host
  )
    throw new Error("The target is the source database — refusing.");
  console.log(`Source: ${hidePassword(source!)}\nTarget: ${hidePassword(target)}\n`);

  const before = await tableCounts(source!);
  const t0 = Date.now();
  execFileSync(
    bin("pg_dump"),
    ["--format=custom", "--no-owner", "--no-privileges", `--file=${dump}`, source!],
    {
      stdio: "inherit",
    },
  );
  const dumpMs = Date.now() - t0;
  console.log(
    `1. Backup (pg_dump): ${seconds(dumpMs)}, ${(statSync(dump).size / 1e6).toFixed(1)} MB`,
  );

  const t1 = Date.now();
  if (!targetArg) {
    const admin = new PrismaClient({ datasourceUrl: source });
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${drillDb}"`);
    await admin.$executeRawUnsafe(`CREATE DATABASE "${drillDb}"`);
    await admin.$disconnect();
  }
  execFileSync(
    bin("pg_restore"),
    [
      "--no-owner",
      "--no-privileges",
      "--clean",
      "--if-exists",
      "--exit-on-error",
      `--dbname=${target}`,
      dump,
    ],
    { stdio: "inherit" },
  );
  const restoreMs = Date.now() - t1;
  console.log(`2. Restore (pg_restore): ${seconds(restoreMs)}`);

  const after = await tableCounts(target);
  const diffs = Object.keys({ ...before.counts, ...after.counts }).filter(
    (t) => before.counts[t] !== after.counts[t],
  );
  // The live database may have taken new orders while the dump ran — that's not a failure of
  // the restore, but report it.
  console.log(`3. Checked ${Object.keys(after.counts).length} tables`);
  for (const t of diffs)
    console.log(`   ✗ ${t}: source ${before.counts[t]} → restored ${after.counts[t]}`);
  console.log(`   newest order:   ${before.latestOrder} → ${after.latestOrder}`);
  console.log(`   newest invoice: ${before.latestInvoice} → ${after.latestInvoice}`);

  const total = Date.now() - t0;
  console.log(`\nTotal backup + restore: ${seconds(total)}  (RTO budget: 4 h — Docs/BACKUPS.md)`);

  if (!keep) {
    rmSync(work, { recursive: true, force: true });
    if (!targetArg) {
      const admin = new PrismaClient({ datasourceUrl: source });
      await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${drillDb}"`);
      await admin.$disconnect();
    }
  } else console.log(`Kept: ${dump} and ${hidePassword(target)}`);

  const ok = diffs.length === 0 && before.latestInvoice === after.latestInvoice;
  console.log(
    ok
      ? "\nDRILL PASSED — the backup restores completely."
      : "\nDRILL FAILED — see differences above.",
  );
  process.exit(ok ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
