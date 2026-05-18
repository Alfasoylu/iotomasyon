import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { LogoutButton } from "@/components/dashboard/logout-button";
import { MobileNavButton } from "@/components/dashboard/mobile-nav-button";
import { Sidebar, type NavItem } from "@/components/dashboard/sidebar";
import { requireUser, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";

// Full navigation definition.
// `section` groups items visually in the sidebar.
// `permission` gates visibility — undefined = visible to all authenticated users.
//
// Role notes (enforced via PERMISSIONS, not duplicated here):
//   SALES (vendors)            — cannot see EXECUTIVE_READ items (import, capital, analytics…)
//   OPERATIONS (warehouse)     — cannot see pricing/margin pages (EXECUTIVE_READ gated)
//   MARKETPLACE_OPERATOR       — sees marketplace section; no import/financial data
//   ADMIN                      — bypasses all permission checks
const ALL_NAV: Array<NavItem & { permission?: string }> = [
  // ── Top-level (no section) ────────────────────────────────────────────────
  { href: "/dashboard", label: "Pano" },

  // ── CRM ───────────────────────────────────────────────────────────────────
  {
    href: "/customers",
    label: "Müşteriler",
    permission: PERMISSIONS.CUSTOMERS_READ,
    section: "CRM",
  },
  {
    href: "/quotes",
    label: "Teklifler",
    permission: PERMISSIONS.QUOTES_READ,
    section: "CRM",
  },
  {
    href: "/quotes/templates",
    label: "Teklif Şablonları",
    permission: PERMISSIONS.QUOTE_TEMPLATES_READ,
    section: "CRM",
  },
  {
    href: "/tasks",
    label: "Görevler",
    permission: PERMISSIONS.TASKS_READ,
    section: "CRM",
  },
  {
    href: "/activity",
    label: "Aktiviteler",
    permission: PERMISSIONS.ACTIVITY_READ,
    section: "CRM",
  },
  {
    href: "/campaigns",
    label: "Kampanyalar",
    permission: PERMISSIONS.CAMPAIGNS_READ,
    section: "CRM",
  },
  // Phase 86 — Satış Fırsat Motoru
  {
    href: "/admin/sales-opportunities",
    label: "Satış Fırsatları",
    permission: PERMISSIONS.CUSTOMERS_READ,
    section: "CRM",
  },

  // ── Ürünler & Stok ────────────────────────────────────────────────────────
  {
    href: "/products",
    label: "Ürünler",
    permission: PERMISSIONS.PRODUCTS_READ,
    section: "Ürünler & Stok",
  },
  {
    href: "/categories",
    label: "Kategoriler",
    permission: PERMISSIONS.CATEGORIES_READ,
    section: "Ürünler & Stok",
  },
  {
    href: "/search",
    label: "Arama",
    permission: PERMISSIONS.SEARCH_READ,
    section: "Ürünler & Stok",
  },
  {
    href: "/admin/stock-health",
    label: "Stok Sağlığı",
    permission: PERMISSIONS.EXECUTIVE_READ,
    section: "Ürünler & Stok",
  },

  // ── Depo (Phase 55 — WAREHOUSE role, INVENTORY_READ gated) ───────────────
  {
    href: "/warehouse",
    label: "Depo",
    permission: PERMISSIONS.INVENTORY_READ,
    section: "Ürünler & Stok",
  },
  {
    href: "/warehouse/count",
    label: "Stok Sayımı",
    permission: PERMISSIONS.INVENTORY_COUNT,
    section: "Ürünler & Stok",
  },

  // ── Pazar Yeri ────────────────────────────────────────────────────────────
  {
    href: "/marketplace",
    label: "Pazar Yerleri",
    permission: PERMISSIONS.MARKETPLACE_LISTINGS_READ,
    section: "Pazar Yeri",
  },
  {
    href: "/marketplace/trendyol",
    label: "Trendyol Paneli",
    permission: PERMISSIONS.MARKETPLACE_LISTINGS_READ,
    section: "Pazar Yeri",
  },
  {
    href: "/marketplace/trendyol/questions",
    label: "Müşteri Soruları",
    permission: PERMISSIONS.MARKETPLACE_QUESTIONS_READ,
    section: "Pazar Yeri",
  },
  {
    href: "/marketplace/trendyol/returns",
    label: "İade Merkezi",
    permission: PERMISSIONS.MARKETPLACE_RETURNS_READ,
    section: "Pazar Yeri",
  },
  {
    href: "/marketplace/profit",
    label: "Pazar Kârlılığı",
    permission: PERMISSIONS.MARKETPLACE_LISTINGS_READ,
    section: "Pazar Yeri",
  },
  {
    href: "/marketplace/return-analysis",
    label: "İade Analizi",
    permission: PERMISSIONS.MARKETPLACE_RETURNS_READ,
    section: "Pazar Yeri",
  },
  {
    href: "/admin/marketplace-mappings",
    label: "Ürün Eşleştirme",
    permission: PERMISSIONS.MARKETPLACE_MAPPINGS_READ,
    section: "Pazar Yeri",
  },
  {
    href: "/admin/marketplace-policies",
    label: "Marj Politikaları",
    permission: PERMISSIONS.MARKETPLACE_POLICIES_MANAGE,
    section: "Pazar Yeri",
  },
  {
    href: "/admin/trendyol-catalog",
    label: "Trendyol Katalog",
    permission: PERMISSIONS.EXECUTIVE_READ,
    section: "Pazar Yeri",
  },
  {
    href: "/admin/xml-sync",
    label: "XML Senkron",
    permission: PERMISSIONS.EXECUTIVE_READ,
    section: "Pazar Yeri",
  },
  {
    href: "/admin/trendyol",
    label: "Trendyol API",
    permission: PERMISSIONS.EXECUTIVE_READ,
    section: "Pazar Yeri",
  },

  // ── İthalat & Analiz ─────────────────────────────────────────────────────
  // Entire section gated behind EXECUTIVE_READ → invisible to SALES / standard OPERATIONS
  {
    href: "/orders",
    label: "Siparişler",
    permission: PERMISSIONS.EXECUTIVE_READ,
    section: "İthalat & Analiz",
  },
  {
    href: "/admin/import-cockpit",
    label: "İthalat Cockpiti",
    permission: PERMISSIONS.EXECUTIVE_READ,
    section: "İthalat & Analiz",
  },
  {
    href: "/admin/import-decisions",
    label: "İthalat Kararları",
    permission: PERMISSIONS.EXECUTIVE_READ,
    section: "İthalat & Analiz",
  },
  {
    href: "/admin/import-calculator",
    label: "İthalat Hesaplayıcı",
    permission: PERMISSIONS.EXECUTIVE_READ,
    section: "İthalat & Analiz",
  },
  {
    href: "/admin/procurement",
    label: "Tedarik Asistanı",
    permission: PERMISSIONS.EXECUTIVE_READ,
    section: "İthalat & Analiz",
  },
  {
    href: "/admin/purchase-orders",
    label: "Satın Alma Siparişleri",
    permission: PERMISSIONS.EXECUTIVE_READ,
    section: "İthalat & Analiz",
  },
  {
    href: "/admin/suppliers",
    label: "Tedarikçiler",
    permission: PERMISSIONS.SUPPLIERS_READ,
    section: "İthalat & Analiz",
  },
  {
    href: "/admin/exchange-rates",
    label: "Döviz Kurları",
    permission: PERMISSIONS.EXCHANGE_RATES_MANAGE,
    section: "İthalat & Analiz",
  },
  {
    href: "/admin/capital",
    label: "Sermaye",
    permission: PERMISSIONS.EXECUTIVE_READ,
    section: "İthalat & Analiz",
  },
  {
    href: "/admin/product-performance",
    label: "Satış Performansı",
    permission: PERMISSIONS.EXECUTIVE_READ,
    section: "İthalat & Analiz",
  },
  {
    href: "/marketplace/realized-margin",
    label: "Gerçekleşen Marj",
    permission: PERMISSIONS.EXECUTIVE_READ,
    section: "İthalat & Analiz",
  },
  {
    href: "/admin/trendyol-report",
    label: "Trendyol Raporu",
    permission: PERMISSIONS.EXECUTIVE_READ,
    section: "İthalat & Analiz",
  },
  {
    href: "/admin/trendyol-matching",
    label: "Satış Eşleştirme",
    permission: PERMISSIONS.EXECUTIVE_READ,
    section: "İthalat & Analiz",
  },

  // ── Yönetim ───────────────────────────────────────────────────────────────
  {
    href: "/admin/users",
    label: "Kullanıcılar",
    permission: PERMISSIONS.USERS_READ,
    section: "Yönetim",
  },
  {
    href: "/admin/executive",
    label: "Yönetici Paneli",
    permission: PERMISSIONS.EXECUTIVE_READ,
    section: "Yönetim",
  },
  {
    href: "/admin/data-hygiene",
    label: "Veri Hijyeni",
    permission: PERMISSIONS.EXECUTIVE_READ,
    section: "Yönetim",
  },
  {
    href: "/admin/safety",
    label: "Üretim Güvenliği",
    permission: PERMISSIONS.EXECUTIVE_READ,
    section: "Yönetim",
  },
];

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();

  // Compute which nav items this user is allowed to see — preserving section grouping.
  const navChecks = await Promise.all(
    ALL_NAV.map(async (item) => {
      const allowed =
        !item.permission || (await checkPermission(user, item.permission));
      return allowed
        ? { href: item.href, label: item.label, section: item.section }
        : null;
    }),
  );
  const allowedNav = navChecks.filter(Boolean) as NavItem[];

  // Users with zero non-dashboard items have effectively no access.
  const hasAccess = allowedNav.some((item) => item.href !== "/dashboard");
  if (!hasAccess) redirect("/no-access");

  return (
    <div className="flex min-h-screen">
      <Sidebar items={allowedNav} />
      <div className="flex min-h-screen flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-[#f8f5ef]/90 px-4 py-4 backdrop-blur md:px-8">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <MobileNavButton />
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                  Dahili çalışma alanı
                </p>
                <h2 className="text-lg font-semibold text-slate-950">
                  {user.name}
                </h2>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden rounded-xl border border-slate-200 bg-white px-4 py-2 text-right md:block">
                <p className="text-xs uppercase tracking-[0.25em] text-slate-400">
                  Hesap
                </p>
                <p className="text-sm font-medium text-slate-800">
                  {user.email}
                </p>
              </div>
              <LogoutButton />
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
