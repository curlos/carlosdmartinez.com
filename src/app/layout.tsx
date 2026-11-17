import type { Metadata, Viewport } from "next";
import { Footer } from "@/components/Footer";
import { Nav } from "@/components/Nav";
import { BASE_OPEN_GRAPH, SITE_DESCRIPTION, SITE_TITLE, SITE_URL } from "@/lib/site";
import { inter, jetbrainsMono } from "./fonts";
import "./globals.css";

// Fails the build if any route stops being fully static.
export const ensureStatic = "navigation";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_TITLE, template: "%s · Carlos Martinez" },
  description: SITE_DESCRIPTION,
  // canonical and og:url are set per page; children would inherit them from here.
  openGraph: { ...BASE_OPEN_GRAPH, title: SITE_TITLE, description: SITE_DESCRIPTION },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: "#0d1117",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body className="flex min-h-dvh flex-col" suppressHydrationWarning>
        <a
          href="#main"
          className="sr-only rounded-btn bg-accent px-4 py-2 font-semibold text-bg focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 hover:text-bg"
        >
          Skip to content
        </a>
        <Nav />
        <main id="main" className="container-page w-full flex-1">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
