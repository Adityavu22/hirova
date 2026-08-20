import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

// 1. Social metadata uses the actual request host in local and deployed environments.
export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  const base = new URL(`${protocol}://${host}`);
  const image = new URL("/hirova-social.png", base).toString();
  const description = "Get hired smarter with source-verified jobs, personalised matching, resume intelligence, and practical interview preparation.";
  return {
    metadataBase: base,
    title: "Hirova — Get hired smarter.",
    description,
    icons: { icon: "/favicon.svg" },
    openGraph: { title: "Hirova — Get hired smarter.", description, images: [{ url: image, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title: "Hirova — Get hired smarter.", description, images: [image] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
