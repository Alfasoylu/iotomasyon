import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "PDKS — Devam Takip",
  manifest: "/pdks/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "PDKS" },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function PdksLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-slate-950 text-slate-100">{children}</div>;
}
