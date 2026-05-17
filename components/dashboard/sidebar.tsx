"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";

import { useSidebarStore } from "@/hooks/use-sidebar-store";

export type NavItem = { href: string; label: string; section?: string };

interface SidebarProps {
  items: NavItem[];
}

// Canonical section order — any section not listed here still renders, just after these.
const SECTION_ORDER = [
  "CRM",
  "Ürünler & Stok",
  "Pazar Yeri",
  "İthalat & Analiz",
  "Yönetim",
];

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`h-3 w-3 flex-shrink-0 text-slate-400 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2.5}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

export function Sidebar({ items }: SidebarProps) {
  const pathname = usePathname();
  const { mobileOpen, setMobileOpen } = useSidebarStore();

  // ── Grouping ─────────────────────────────────────────────────────────────

  // Items with no section (e.g. Dashboard) sit above the grouped sections.
  const topItems = items.filter((i) => !i.section);

  // Build section map in canonical order, then append any extras.
  const grouped = new Map<string, NavItem[]>();
  for (const sec of SECTION_ORDER) {
    const secItems = items.filter((i) => i.section === sec);
    if (secItems.length > 0) grouped.set(sec, secItems);
  }
  for (const item of items) {
    if (item.section && !grouped.has(item.section)) {
      grouped.set(item.section, items.filter((i) => i.section === item.section));
    }
  }

  // ── Active detection ──────────────────────────────────────────────────────

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  const activeSection =
    items.find((i) => i.section && isActive(i.href))?.section ?? null;

  // ── Collapsible state — all open by default ───────────────────────────────

  const [openSections, setOpenSections] = useState<Set<string>>(
    () => new Set(SECTION_ORDER),
  );

  // Always keep the active section open when path changes.
  useEffect(() => {
    if (activeSection) {
      setOpenSections((prev) => {
        if (prev.has(activeSection)) return prev;
        return new Set([...prev, activeSection]);
      });
    }
  }, [activeSection]);

  function toggleSection(sec: string) {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(sec)) next.delete(sec);
      else next.add(sec);
      return next;
    });
  }

  // ── Nav link component ────────────────────────────────────────────────────

  function NavLink({ item }: { item: NavItem }) {
    const active = isActive(item.href);
    return (
      <Link
        href={item.href}
        onClick={() => setMobileOpen(false)}
        className={`block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
          active
            ? "bg-slate-900 text-white"
            : "text-slate-600 hover:bg-white hover:text-slate-950"
        }`}
      >
        {item.label}
      </Link>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className={`fixed inset-0 z-30 bg-slate-950/30 transition-opacity md:hidden ${
          mobileOpen
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
        }`}
        onClick={() => setMobileOpen(false)}
      />

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-200 bg-[#f4f1ea] transition-transform duration-300 md:static md:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Brand */}
        <div className="flex-shrink-0 border-b border-slate-200 px-5 py-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-400">
            Iotomasyon
          </p>
          <h1 className="mt-1.5 text-xl font-semibold text-slate-900">
            Dahili CRM
          </h1>
        </div>

        {/* Scrollable navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
          {/* Top-level items (no section — Dashboard etc.) */}
          {topItems.map((item) => (
            <NavLink key={item.href} item={item} />
          ))}

          {/* Divider between top items and sections */}
          {topItems.length > 0 && grouped.size > 0 && (
            <div className="my-2 border-t border-slate-200" />
          )}

          {/* Grouped sections */}
          {[...grouped.entries()].map(([sec, secItems]) => {
            const isOpen = openSections.has(sec);
            const hasActive = secItems.some((i) => isActive(i.href));

            return (
              <div key={sec} className="mb-0.5">
                {/* Section header / toggle */}
                <button
                  type="button"
                  onClick={() => toggleSection(sec)}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-1.5 transition-colors hover:bg-slate-100 ${
                    hasActive ? "text-slate-800" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  <span
                    className={`text-[10px] font-semibold uppercase tracking-widest ${
                      hasActive ? "text-slate-600" : "text-slate-400"
                    }`}
                  >
                    {sec}
                  </span>
                  <ChevronIcon open={isOpen} />
                </button>

                {/* Section items */}
                {isOpen && (
                  <div className="ml-1 mt-0.5 space-y-0.5">
                    {secItems.map((item) => (
                      <NavLink key={item.href} item={item} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="flex-shrink-0 border-t border-slate-200 px-5 py-3">
          <p className="text-[10px] text-slate-400">Faz 53 aktif</p>
        </div>
      </aside>
    </>
  );
}
