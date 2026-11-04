/**
 * Emergency: clears someone's two-step sign-in so they can set it up again at their next admin
 * visit — for when the only owner lost their phone AND their recovery codes.
 *
 *   npm run staff:reset-2fa -- owner@example.com
 *
 * Needs DATABASE_URL (run it where the database is reachable). Logged as staff.2fa_reset_cli.
 */
import { PrismaClient } from "@prisma/client";

const email = (process.argv[2] ?? "").trim().toLowerCase();
const db = new PrismaClient();

async function main() {
  if (!email.includes("@")) {
    console.error("Usage: npm run staff:reset-2fa -- person@example.com");
    process.exitCode = 1;
    return;
  }
  const user = await db.user.findUnique({ where: { email }, select: { id: true, role: true } });
  if (!user) {
    console.error(`No account with the email ${email}.`);
    process.exitCode = 1;
    return;
  }
  await db.user.update({
    where: { id: user.id },
    data: { totpSecret: null, totpEnabledAt: null, totpLastStep: null, recoveryCodes: [] },
  });
  await db.auditLog.create({
    data: {
      actorId: null,
      actorEmail: "command line",
      action: "staff.2fa_reset_cli",
      entityType: "staff",
      entityId: user.id,
      summary: `Two-step sign-in reset from the command line for ${email}`,
    },
  });
  console.log(
    `Two-step sign-in reset for ${email}. They set it up again at their next admin visit.`,
  );
}

main().finally(() => db.$disconnect());
