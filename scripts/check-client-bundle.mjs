#!/usr/bin/env node
/**
 * Fails if any server secret appears in the browser bundle (.next/static).
 * Run after `next build`:  node scripts/check-client-bundle.mjs
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const SECRET_VARS = [
  "AUTH_SECRET",
  "AUTH_GOOGLE_SECRET",
  "DATABASE_URL",
  "DIRECT_URL",
  "RAZORPAY_KEY_SECRET",
  "RAZORPAY_WEBHOOK_SECRET",
  "RESEND_API_KEY",
  "CLOUDINARY_API_SECRET",
  "SENTRY_AUTH_TOKEN",
  "SEED_ADMIN_PASSWORD",
];

const secrets = SECRET_VARS.map((name) => [name, process.env[name]]).filter(
  ([, v]) => v && v.length >= 8,
);
if (secrets.length === 0) {
  console.log("check-client-bundle: no secrets set in the environment; nothing to check.");
  process.exit(0);
}

const root = path.join(process.cwd(), ".next", "static");
const files = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.(js|css|html|json|map)$/.test(entry)) files.push(full);
  }
})(root);

const leaks = [];
for (const file of files) {
  const content = readFileSync(file, "utf8");
  for (const [name, value] of secrets)
    if (content.includes(value))
      leaks.push(`${name} found in ${path.relative(process.cwd(), file)}`);
}

if (leaks.length) {
  console.error("❌ Secrets leaked into the browser bundle:\n  " + leaks.join("\n  "));
  process.exit(1);
}
console.log(
  `✔ check-client-bundle: ${secrets.length} secrets checked across ${files.length} browser files — none found.`,
);
