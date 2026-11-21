import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import { ADMIN_PATH_HEADER } from "@/auth.config";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { Analytics } from "@/components/analytics/analytics";
import { publicEnv } from "@/lib/env";
import { MODE_COOKIE, parseMode, shopTokens, themeCss } from "@/lib/theme";
import { getAppearanceSafe, getLiveTheme } from "@/services/appearance.service";
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
import { SitePopup } from "@/components/popup/site-popup";
import { getCurrentUser } from "@/lib/auth-guards";
import { todayInIndia } from "@/lib/appearance";
import { visitDays } from "@/lib/popup";
import { getLivePopup } from "@/services/popup.service";

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

export async function generateViewport(): Promise<Viewport> {
  const { colors } = await getLiveTheme();
  return {
    width: "device-width",
    initialScale: 1,
    themeColor: [
      { media: "(prefers-color-scheme: light)", color: shopTokens(colors, "light").brand },
      { media: "(prefers-color-scheme: dark)", color: shopTokens(colors, "dark").brand },
    ],
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Admin pages keep the admin look; every other page gets the shop look (AreaSync keeps this
  // right after in-app navigation). Colours and decoration come from the live festival theme
  // (Admin → Appearance). Light/dark: the shopper's sun/moon choice, else the admin's default.
  const admin = (await headers()).has(ADMIN_PATH_HEADER);
  const [appearance, theme, popup] = await Promise.all([
    getAppearanceSafe(),
    getLiveTheme(),
    admin ? null : getLivePopup(),
  ]);
  const signedIn = popup?.action === "signin" ? Boolean(await getCurrentUser()) : false;
  const mode = parseMode((await cookies()).get(MODE_COOKIE)?.value) ?? appearance.defaultMode;
  return (
    <html
      lang="en-IN"
      data-area={admin ? "admin" : "shop"}
      data-mode={mode}
      data-decor={theme.decor}
    >
      <head>
        <style id="shop-theme" dangerouslySetInnerHTML={{ __html: themeCss(theme.colors) }} />
      </head>
      <body className="flex min-h-dvh flex-col antialiased">
        <AreaSync />
        <AnnouncementBar />
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
        {popup && (
          <SitePopup
            popup={popup}
            siteName={publicEnv.NEXT_PUBLIC_SITE_NAME}
            days={visitDays(todayInIndia())}
            signedIn={signedIn}
          />
        )}
        <Analytics gaId={publicEnv.NEXT_PUBLIC_GA_ID} />
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
