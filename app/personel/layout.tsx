import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Personel Devam Takip",
  manifest: "/personel/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Devam Takip" },
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
