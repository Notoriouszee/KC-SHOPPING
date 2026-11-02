import type { Metadata, Viewport } from "next";
import { appUrl } from "../lib/config";
import { DEFAULT_OG_HEIGHT, DEFAULT_OG_IMAGE, DEFAULT_OG_WIDTH, SITE_NAME } from "../lib/seo";
import "./globals.css";

const TITLE = "K&C Shopping — curated elegance, discover independent shops";
const DESCRIPTION =
  "A curated marketplace for individual style. Browse K&C shops, discover independent sellers and order directly from them.";

export const metadata: Metadata = {
  // Makes every relative metadata URL absolute for crawlers.
  metadataBase: new URL(appUrl()),
  title: {
    default: TITLE,
    template: "%s · K&C Shopping",
  },
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: TITLE,
    description: DESCRIPTION,
    images: [
      {
        url: DEFAULT_OG_IMAGE,
        width: DEFAULT_OG_WIDTH,
        height: DEFAULT_OG_HEIGHT,
        alt: SITE_NAME,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
  },
  // Dashboard, admin and auth routes are private; keep them out of search results.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#080808",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}