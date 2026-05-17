"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useSidebarStore } from "@/hooks/use-sidebar-store";

export type NavItem = { href: string; label: string };

interface SidebarProps {
  items: NavItem[];
}

export function Sidebar({ items }: SidebarProps) {
  const pathname = usePathname();
  const { mobileOpen, setMobileOpen } = useSidebarStore();

  return (
    <>
      <div
        className={`fixed inset-0 z-30 bg-slate-950/30 transition md:hidden ${mobileOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"}`}
        onClick={() => setMobileOpen(false)}
      />
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-slate-200 bg-[#f4f1ea] px-5 py-6 transition md:static md:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="border-b border-slate-300 pb-5">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
            Iotomasyon
          </p>
          <h1 className="mt-3 text-2xl font-semibold text-slate-900">Dahili CRM</h1>
          <p className="mt-2 text-sm text-slate-600">
            Ürün, müşteri ve stok akışını tek ekrandan yönetin.
          </p>
        </div>

        <nav className="mt-6 flex flex-1 flex-col gap-1">
          {items.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  isActive
                    ? "bg-slate-900 text-white"
                    : "text-slate-700 hover:bg-white hover:text-slate-950"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="rounded-2xl bg-white p-4 text-sm text-slate-600 shadow-sm">
          Faz 33 aktif
          <p className="mt-2 font-medium text-slate-900">
            Pazar Yeri Fiyatlandırması: XML/manuel fiyat, kargo dilimi, komisyon, net kalan.
          </p>
        </div>
      </aside>
    </>
  );
}
