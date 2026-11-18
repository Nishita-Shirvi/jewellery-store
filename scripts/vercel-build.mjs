/**
 * Vercel build: `prisma generate` → `prisma migrate deploy` (PRODUCTION deployments only) → `next build`.
 *
 * Preview deployments usually share or point at a database that must not be migrated by an
 * unmerged branch, so migrations run only when VERCEL_ENV=production. Each step inherits
 * stdio and the build stops at the first non-zero exit.
 */
import { spawnSync } from "node:child_process";

function run(command, args) {
  console.log(`\n▶ ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.error) {
    console.error(`❌ Could not start ${command}:`, result.error);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(
      `❌ ${command} ${args.join(" ")} failed (exit ${result.status ?? result.signal})`,
    );
    process.exit(result.status ?? 1);
  }
}

run("npx", ["prisma", "generate"]);
// RUN_MIGRATIONS=1 opts a preview in (only when it has its OWN database, e.g. a Neon branch).
if (process.env.VERCEL_ENV === "production" || process.env.RUN_MIGRATIONS === "1") {
  run("npx", ["prisma", "migrate", "deploy"]);
} else {
  console.log(
    `\nℹ Skipping prisma migrate deploy (VERCEL_ENV=${process.env.VERCEL_ENV ?? "unset"}; runs on production only).`,
  );
}
run("npx", ["next", "build"]);
