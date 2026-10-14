import type { Metadata, Viewport } from "next";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { Analytics } from "@/components/analytics/analytics";
import { publicEnv } from "@/lib/env";
import "@fontsource/marcellus/400.css";
import "@fontsource-variable/figtree";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(publicEnv.NEXT_PUBLIC_APP_URL),
  title: {
    default: publicEnv.NEXT_PUBLIC_SITE_NAME,
    template: `%s | ${publicEnv.NEXT_PUBLIC_SITE_NAME}`,
  },
  description: "Hallmarked gold, silver and diamond jewellery, delivered insured across India.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-IN">
      <body className="flex min-h-dvh flex-col antialiased">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
        <Analytics gaId={publicEnv.NEXT_PUBLIC_GA_ID} />
      </body>
    </html>
  );
}
