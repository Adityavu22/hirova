import type { Metadata } from "next";
import "./globals.css";

// 1. Search engines and social previews always use the branded public domain.
const description = "Get hired smarter with source-verified jobs, personalised matching, resume intelligence, and practical interview preparation.";
export const metadata: Metadata = {
  metadataBase: new URL("https://hirova.in"),
  alternates: { canonical: "/" },
  title: "Hirova — Get hired smarter.",
  description,
  icons: { icon: "/favicon.svg" },
  openGraph: { url: "/", title: "Hirova — Get hired smarter.", description, images: [{ url: "/hirova-social-v2.png", width: 1200, height: 630 }] },
  twitter: { card: "summary_large_image", title: "Hirova — Get hired smarter.", description, images: ["/hirova-social-v2.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
