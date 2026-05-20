"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, type ComponentType } from "react";
import {
  Home,
  Activity,
  Heart,
  Users,
  FileText,
  FilePlus,
  CheckSquare,
  ClipboardList,
  Bell,
  Megaphone,
  Target,
  Package,
  FolderTree,
  Search,
  Warehouse,
  Box,
  ShoppingCart,
  HelpCircle,
  Undo2,
  PieChart,
  TrendingDown,
  Link2,
  Settings,
  Key,
  BookOpen,
  RefreshCw,
  Ship,
  FileSearch,
  Calculator,
  Handshake,
  Truck,
  DollarSign,
  TrendingUp,
  BarChart3,
  Ruler,
  Crosshair,
  User,
  Archive,
  ShieldCheck,
  Sparkles,
  MessageSquare,
  type LucideIcon,
} from "lucide-react";

import { useSidebarStore } from "@/hooks/use-sidebar-store";

export type NavItem = {
  href: string;
  label: string;
  section?: string;
  subGroup?: string;
  iconKey?: string;
};

interface SidebarProps {
  items: NavItem[];
}

// ── Icon registry ─────────────────────────────────────────────────────────
// İçeride tutulur — Server Component'ten string key olarak geliyor.
const ICONS: Record<string, LucideIcon> = {
  home: Home,
  activity: Activity,
  heart: Heart,
  users: Users,
  fileText: FileText,
  filePlus: FilePlus,
  checkSquare: CheckSquare,
  clipboardList: ClipboardList,
  bell: Bell,
  megaphone: Megaphone,
  target: Target,
  package: Package,
  folderTree: FolderTree,
  search: Search,
  warehouse: Warehouse,
  box: Box,
  cart: ShoppingCart,
  help: HelpCircle,
  undo: Undo2,
  pieChart: PieChart,
  trendingDown: TrendingDown,
  link: Link2,
  settings: Settings,
  key: Key,
  book: BookOpen,
  refresh: RefreshCw,
  ship: Ship,
  fileSearch: FileSearch,
  calculator: Calculator,
  handshake: Handshake,
  truck: Truck,
  dollar: DollarSign,
  trendingUp: TrendingUp,
  chart: BarChart3,
  ruler: Ruler,
  crosshair: Crosshair,
  user: User,
  archive: Archive,
  shield: ShieldCheck,
  sparkles: Sparkles,
  messageSquare: MessageSquare,
};

// Section meta — order + icon + short description (tooltip).
const SECTION_META: Array<{ key: string; icon: LucideIcon; desc: string }> = [
  { key: "Günlük Durum", icon: Sparkles, desc: "Manşet panolar — bugün ne yapmalı?" },
  { key: "Satış", icon: Users, desc: "Müşteri, teklif, görev, kampanya" },
  { key: "Ürünler & Stok", icon: Package, desc: "Ürünler, kategoriler, depo" },
  { key: "Pazaryerleri", icon: ShoppingCart, desc: "Trendyol, Hepsiburada, kârlılık" },
  { key: "İthalat", icon: Ship, desc: "Karar kokpiti, hesaplayıcı, tedarikçi" },
  { key: "Finans", icon: DollarSign, desc: "Sermaye, döviz, raporlar" },
  { key: "Sistem", icon: Settings, desc: "Kullanıcılar, arşiv" },
];
const SECTION_ORDER = SECTION_META.map((s) => s.key);
const SECTION_ICONS = Object.fromEntries(SECTION_META.map((s) => [s.key, s.icon]));

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

  const topItems = items.filter((i) => !i.section);

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

  // ── Collapsible state ─────────────────────────────────────────────────────

  const [openSections, setOpenSections] = useState<Set<string>>(
    () => new Set(SECTION_ORDER),
  );

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

  // ── Nav link ─────────────────────────────────────────────────────────────

  function NavLink({ item, indent = false }: { item: NavItem; indent?: boolean }) {
    const active = isActive(item.href);
    const Icon: ComponentType<{ className?: string }> | undefined = item.iconKey
      ? ICONS[item.iconKey]
      : undefined;
    return (
      <Link
        href={item.href}
        onClick={() => setMobileOpen(false)}
        className={`flex items-center gap-2 rounded-lg ${indent ? "pl-5 pr-3" : "px-3"} py-2 text-sm font-medium transition-colors ${
          active
            ? "bg-slate-900 text-white"
            : "text-slate-600 hover:bg-white hover:text-slate-950"
        }`}
        title={item.label}
      >
        {Icon ? (
          <Icon
            className={`h-4 w-4 flex-shrink-0 ${active ? "text-white/90" : "text-slate-400"}`}
          />
        ) : (
          <span className="w-4" />
        )}
        <span className="truncate">{item.label}</span>
      </Link>
    );
  }

  // Render section items with sub-group headers.
  function SectionItems({ items: secItems }: { items: NavItem[] }) {
    type Block = { kind: "items"; items: NavItem[] } | { kind: "header"; label: string; items: NavItem[] };
    const blocks: Block[] = [];
    let currentSub: string | null = null;
    let buffer: NavItem[] = [];

    function flush() {
      if (buffer.length === 0) return;
      if (currentSub === null) blocks.push({ kind: "items", items: buffer });
      else blocks.push({ kind: "header", label: currentSub, items: buffer });
      buffer = [];
    }

    for (const item of secItems) {
      const sub = item.subGroup ?? null;
      if (sub !== currentSub) {
        flush();
        currentSub = sub;
      }
      buffer.push(item);
    }
    flush();

    return (
      <div className="ml-1 mt-0.5 space-y-0.5">
        {blocks.map((b, i) =>
          b.kind === "items" ? (
            <div key={`b${i}`} className="space-y-0.5">
              {b.items.map((item) => (
                <NavLink key={item.href} item={item} />
              ))}
            </div>
          ) : (
            <div key={`b${i}`} className="mt-2 space-y-0.5">
              <p className="px-3 pt-1 pb-0.5 text-[9px] font-semibold uppercase tracking-widest text-slate-400">
                {b.label}
              </p>
              {b.items.map((item) => (
                <NavLink key={item.href} item={item} indent />
              ))}
            </div>
          ),
        )}
      </div>
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
          {/* Top-level items (Pano) */}
          {topItems.map((item) => (
            <NavLink key={item.href} item={item} />
          ))}

          {topItems.length > 0 && grouped.size > 0 && (
            <div className="my-2 border-t border-slate-200" />
          )}

          {/* Grouped sections */}
          {[...grouped.entries()].map(([sec, secItems]) => {
            const isOpen = openSections.has(sec);
            const hasActive = secItems.some((i) => isActive(i.href));
            const SecIcon = SECTION_ICONS[sec];

            return (
              <div key={sec} className="mb-0.5">
                <button
                  type="button"
                  onClick={() => toggleSection(sec)}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-1.5 transition-colors hover:bg-slate-100 ${
                    hasActive ? "text-slate-800" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    {SecIcon ? (
                      <SecIcon
                        className={`h-3.5 w-3.5 ${hasActive ? "text-slate-700" : "text-slate-400"}`}
                      />
                    ) : null}
                    <span
                      className={`text-[10px] font-semibold uppercase tracking-widest ${
                        hasActive ? "text-slate-700" : "text-slate-500"
                      }`}
                    >
                      {sec}
                    </span>
                  </span>
                  <ChevronIcon open={isOpen} />
                </button>

                {isOpen && <SectionItems items={secItems} />}
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="flex-shrink-0 border-t border-slate-200 px-5 py-3">
          <p className="text-[10px] text-slate-400">v2026.5</p>
        </div>
      </aside>
    </>
  );
}
