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
  const description = "Discover current, source-verified jobs and use practical AI to match, apply, prepare, and stay organised.";
  return {
    metadataBase: base,
    title: "Hirova — Real jobs, matched intelligently",
    description,
    icons: { icon: "/favicon.svg" },
    openGraph: { title: "Hirova — Real jobs, matched intelligently", description, images: [{ url: image, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title: "Hirova — Real jobs, matched intelligently", description, images: [image] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
