import "server-only";
import { db } from "@/lib/db";
import { env, publicEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { istDay } from "@/lib/report/dates";
import { sendEmail } from "@/services/email.service";
import { LOW_STOCK_ALERT_THRESHOLD, lowStockProducts } from "@/services/report.service";

/** Emails the low-stock list to the admins, at most once per India-time day. */
export async function sendLowStockAlert(): Promise<{ sent: boolean; count: number }> {
  const items = await lowStockProducts();
  if (items.length === 0) return { sent: false, count: 0 };

  const key = `alert:low-stock:${istDay(new Date())}`;
  const already = await db.appSetting.findUnique({ where: { key } });
  if (already) return { sent: false, count: items.length };

  const recipients = env.ADMIN_ALERT_EMAIL
    ? [env.ADMIN_ALERT_EMAIL]
    : (await db.user.findMany({ where: { role: "ADMIN" }, select: { email: true } })).map(
        (u) => u.email,
      );
  const lines = items.map(
    (i) => `${i.name}: ${i.available === 0 ? "OUT OF STOCK" : `${i.available} left`}`,
  );
  const link = `${publicEnv.NEXT_PUBLIC_APP_URL}/admin/products?status=low`;
  for (const to of recipients) {
    await sendEmail({
      to,
      subject: `${items.length} piece(s) low on stock`,
      text: `These pieces have ${LOW_STOCK_ALERT_THRESHOLD} or fewer available:\n\n${lines.join("\n")}\n\n${link}`,
      html: `<p>These pieces have ${LOW_STOCK_ALERT_THRESHOLD} or fewer available:</p><ul>${lines.map((l) => `<li>${l.replace(/[<>&]/g, "")}</li>`).join("")}</ul><p><a href="${link}">Open products</a></p>`,
    });
  }
  await db.appSetting.create({ data: { key, value: { count: items.length } } });
  logger.info("alert.low_stock_sent", { count: items.length, recipients: recipients.length });
  return { sent: true, count: items.length };
}
