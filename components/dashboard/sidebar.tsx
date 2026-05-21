"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
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
  ChevronRight,
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
  { key: "Günlük Durum", icon: Sparkles, desc: "Manşet panolar" },
  { key: "Satış", icon: Users, desc: "Müşteri, teklif, görev" },
  { key: "Ürünler & Stok", icon: Package, desc: "Ürünler, kategoriler" },
  { key: "Pazaryerleri", icon: ShoppingCart, desc: "Trendyol, kârlılık" },
  { key: "İthalat", icon: Ship, desc: "Karar kokpiti, tedarikçi" },
  { key: "Finans", icon: DollarSign, desc: "Sermaye, döviz" },
  { key: "Sistem", icon: Settings, desc: "Kullanıcılar, arşiv" },
];
const SECTION_ORDER = SECTION_META.map((s) => s.key);
const SECTION_ICONS = Object.fromEntries(SECTION_META.map((s) => [s.key, s.icon]));

export function Sidebar({ items }: SidebarProps) {
  const pathname = usePathname();
  const { mobileOpen, setMobileOpen } = useSidebarStore();

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

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }
  const activeSection =
    items.find((i) => i.section && isActive(i.href))?.section ?? null;

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

  function NavLink({ item, indent = false }: { item: NavItem; indent?: boolean }) {
    const active = isActive(item.href);
    const Icon: LucideIcon | undefined = item.iconKey ? ICONS[item.iconKey] : undefined;
    return (
      <Link
        href={item.href}
        onClick={() => setMobileOpen(false)}
        title={item.label}
        className={`flex items-center gap-2.5 rounded-md ${indent ? "pl-6 pr-3" : "px-3"} py-1.5 text-[13px] font-medium transition-colors duration-100 ${
          active
            ? "bg-[var(--accent-dim)] text-[var(--accent)] border border-[var(--accent-border)]"
            : "border border-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]"
        }`}
      >
        {Icon ? (
          <Icon size={14} strokeWidth={active ? 2 : 1.5} className="flex-shrink-0" />
        ) : (
          <span className="w-3.5 flex-shrink-0" />
        )}
        <span className="truncate">{item.label}</span>
      </Link>
    );
  }

  function SectionItems({ items: secItems }: { items: NavItem[] }) {
    type Block =
      | { kind: "items"; items: NavItem[] }
      | { kind: "header"; label: string; items: NavItem[] };
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
      <div className="mt-0.5 space-y-0.5">
        {blocks.map((b, i) =>
          b.kind === "items" ? (
            <div key={`b${i}`} className="space-y-0.5">
              {b.items.map((item) => (
                <NavLink key={item.href} item={item} />
              ))}
            </div>
          ) : (
            <div key={`b${i}`} className="mt-2 space-y-0.5">
              <p className="px-3 pt-1 pb-0.5 text-[10px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
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

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className={`fixed inset-0 z-30 bg-black/60 transition-opacity md:hidden ${
          mobileOpen
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
        }`}
        onClick={() => setMobileOpen(false)}
      />

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-[var(--border-default)] bg-[var(--surface-1)] transition-transform duration-300 md:static md:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Brand */}
        <div className="flex-shrink-0 border-b border-[var(--border-default)] px-4 py-4">
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/Soylu logo şeffaf.png"
              alt="Alfa Soylu Elektronik"
              className="h-9 w-9 object-contain"
            />
            <div className="min-w-0">
              <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--text-muted)] leading-tight">
                Alfa Soylu
              </p>
              <h1 className="text-[13px] font-semibold text-[var(--text-primary)] leading-tight">
                İotomasyon CRM
              </h1>
            </div>
          </div>
        </div>

        {/* Scrollable navigation */}
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
          {/* Top-level items (Pano) */}
          {topItems.map((item) => (
            <NavLink key={item.href} item={item} />
          ))}

          {topItems.length > 0 && grouped.size > 0 && (
            <div className="my-2 border-t border-[var(--border-subtle)]" />
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
                  className={`flex w-full items-center justify-between rounded-md px-3 py-1.5 transition-colors duration-100 hover:bg-[var(--surface-3)] ${
                    hasActive
                      ? "text-[var(--text-primary)]"
                      : "text-[var(--text-muted)]"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    {SecIcon ? (
                      <SecIcon
                        size={12}
                        strokeWidth={1.5}
                        className={hasActive ? "text-[var(--text-secondary)]" : "text-[var(--text-muted)]"}
                      />
                    ) : null}
                    <span className="text-[10px] font-medium uppercase tracking-widest">
                      {sec}
                    </span>
                  </span>
                  <ChevronRight
                    size={12}
                    strokeWidth={1.5}
                    className={`text-[var(--text-muted)] transition-transform duration-150 ${
                      isOpen ? "rotate-90" : ""
                    }`}
                  />
                </button>
                {isOpen && <SectionItems items={secItems} />}
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="flex-shrink-0 border-t border-[var(--border-default)] px-4 py-3">
          <p className="text-[10px] text-[var(--text-muted)]">v2026.5</p>
        </div>
      </aside>
    </>
  );
}
