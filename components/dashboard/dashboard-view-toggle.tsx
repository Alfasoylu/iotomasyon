"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Eye } from "lucide-react";

/**
 * Admin'in dashboard'da hangi temayı (Yönetici / Satış Temsilcisi) gördüğünü
 * kontrol eden basit toggle. Diğer roller varsayılan olarak kendi temalarını görür.
 */
export function DashboardViewToggle({ currentView }: { currentView: "admin" | "sales" }) {
  const params = useSearchParams();
  const otherView = currentView === "admin" ? "sales" : "admin";
  const otherLabel = currentView === "admin" ? "Satış Temsilcisi Görünümü" : "Yönetici Görünümü";

  // Mevcut query string'i koru, sadece view'i değiştir
  const newParams = new URLSearchParams(params);
  if (otherView === "admin") {
    newParams.delete("view");
  } else {
    newParams.set("view", "sales");
  }
  const qs = newParams.toString();

  return (
    <Link
      href={`/dashboard${qs ? `?${qs}` : ""}`}
      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
      title="Dashboard temasını değiştir"
    >
      <Eye className="h-3.5 w-3.5" />
      {otherLabel} →
    </Link>
  );
}
