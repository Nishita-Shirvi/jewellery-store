import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import { ADMIN_PATH_HEADER } from "@/auth.config";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { Analytics } from "@/components/analytics/analytics";
import { publicEnv } from "@/lib/env";
import { DEFAULT_COLORS, MODE_COOKIE, parseMode, shopTokens, themeCss } from "@/lib/theme";
import "@fontsource/marcellus/400.css";
import "@fontsource-variable/figtree";
import "@fontsource/cormorant-garamond/latin-500.css";
import "@fontsource/cormorant-garamond/latin-500-italic.css";
import "@fontsource/cormorant-garamond/latin-600.css";
import "@fontsource/karla/latin-400.css";
import "@fontsource/karla/latin-500.css";
import "@fontsource/karla/latin-600.css";
import "@fontsource/karla/latin-700.css";
import "./globals.css";
import { RegisterServiceWorker } from "@/components/pwa/register-sw";
import { AnnouncementBar } from "@/components/merch/announcement-bar";
import { AreaSync } from "@/components/theme/area-sync";

export const metadata: Metadata = {
  metadataBase: new URL(publicEnv.NEXT_PUBLIC_APP_URL),
  title: {
    default: publicEnv.NEXT_PUBLIC_SITE_NAME,
    template: `%s | ${publicEnv.NEXT_PUBLIC_SITE_NAME}`,
  },
  description: "Hallmarked gold, silver and diamond jewellery, delivered insured across India.",
  appleWebApp: { capable: true, title: publicEnv.NEXT_PUBLIC_SITE_NAME, statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: shopTokens(DEFAULT_COLORS, "light").brand },
    { media: "(prefers-color-scheme: dark)", color: shopTokens(DEFAULT_COLORS, "dark").brand },
  ],
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Admin pages keep the admin look; every other page gets the shop look (AreaSync keeps this
  // right after in-app navigation). The shopper's light/dark choice comes from the sun/moon
  // button's cookie, else follows their device.
  const admin = (await headers()).has(ADMIN_PATH_HEADER);
  const mode = parseMode((await cookies()).get(MODE_COOKIE)?.value) ?? "system";
  return (
    <html lang="en-IN" data-area={admin ? "admin" : "shop"} data-mode={mode}>
      <head>
        <style id="shop-theme" dangerouslySetInnerHTML={{ __html: themeCss(DEFAULT_COLORS) }} />
      </head>
      <body className="flex min-h-dvh flex-col antialiased">
        <AreaSync />
        <AnnouncementBar />
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
        <Analytics gaId={publicEnv.NEXT_PUBLIC_GA_ID} />
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
