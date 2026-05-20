import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { LogoutButton } from "@/components/dashboard/logout-button";
import { MobileNavButton } from "@/components/dashboard/mobile-nav-button";
import { Sidebar, type NavItem } from "@/components/dashboard/sidebar";
import { CommandPalette } from "@/components/layout/command-palette";
import { requireUser, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";

// ── Navigation definition ──────────────────────────────────────────────────
// 8 mantıksal grup. Her item için:
//   • `iconKey` → Lucide icon (sidebar.tsx ICONS map)
//   • `permission` → görünürlük (undefined = tüm authenticated kullanıcılar)
//   • `section` → sidebar grup başlığı
//   • `subGroup` → grup içinde alt-başlık (örn. "Yapılandırma")
//
// Rol notları (PERMISSIONS'da enforce, burada duplicate değil):
//   SALES               — EXECUTIVE_READ olmayan satış sayfaları
//   OPERATIONS/WAREHOUSE — finansal sayfaları görmez
//   MARKETPLACE_OPERATOR — pazaryeri + iade odaklı
//   ADMIN               — her şeye erişir

const ALL_NAV: Array<NavItem & { permission?: string }> = [
  // ── PANO ─────────────────────────────────────────────────────────────────
  { href: "/dashboard", label: "Pano", iconKey: "home" },

  // ── GÜNLÜK DURUM ─────────────────────────────────────────────────────────
  // Manşet karar panoları — admin/owner için günlük açılan ekranlar.
  {
    href: "/admin/sermaye-saglik",
    label: "Sermaye Sağlığı",
    iconKey: "heart",
    permission: PERMISSIONS.EXECUTIVE_READ,
    section: "Günlük Durum",
  },
  {
    href: "/admin/executive",
    label: "Yönetici Paneli",
    iconKey: "chart",
    permission: PERMISSIONS.EXECUTIVE_READ,
    section: "Günlük Durum",
  },
  {
    href: "/admin/safety",
    label: "Üretim Güvenliği",
    iconKey: "shield",
    permission: PERMISSIONS.EXECUTIVE_READ,
    section: "Günlük Durum",
  },
  {
    href: "/admin/data-hygiene",
    label: "Veri Hijyeni",
    iconKey: "sparkles",
    permission: PERMISSIONS.EXECUTIVE_READ,
    section: "Günlük Durum",
  },

  // ── SATIŞ ────────────────────────────────────────────────────────────────
  {
    href: "/customers",
    label: "Müşteriler",
    iconKey: "users",
    permission: PERMISSIONS.CUSTOMERS_READ,
    section: "Satış",
  },
  {
    href: "/quotes",
    label: "Teklifler",
    iconKey: "fileText",
    permission: PERMISSIONS.QUOTES_READ,
    section: "Satış",
  },
  {
    href: "/quotes/templates",
    label: "Teklif Şablonları",
    iconKey: "filePlus",
    permission: PERMISSIONS.QUOTE_TEMPLATES_READ,
    section: "Satış",
  },
  {
    href: "/tasks",
    label: "Görevler",
    iconKey: "checkSquare",
    permission: PERMISSIONS.TASKS_READ,
    section: "Satış",
  },
  {
    href: "/admin/task-board",
    label: "Görev Panosu",
    iconKey: "clipboardList",
    permission: PERMISSIONS.TASKS_ASSIGN,
    section: "Satış",
  },
  {
    href: "/activity",
    label: "Aktiviteler",
    iconKey: "bell",
    permission: PERMISSIONS.ACTIVITY_READ,
    section: "Satış",
  },
  {
    href: "/campaigns",
    label: "Kampanyalar",
    iconKey: "megaphone",
    permission: PERMISSIONS.CAMPAIGNS_READ,
    section: "Satış",
  },
  {
    href: "/admin/sales-opportunities",
    label: "Satış Fırsatları",
    iconKey: "target",
    permission: PERMISSIONS.CUSTOMERS_READ,
    section: "Satış",
  },
  {
    href: "/customers/import-list",
    label: "Lead Listesi Import",
    iconKey: "filePlus",
    permission: PERMISSIONS.CUSTOMERS_UPDATE,
    section: "Satış",
  },
  {
    href: "/customers/lists",
    label: "Listelerim",
    iconKey: "clipboardList",
    permission: PERMISSIONS.CUSTOMERS_READ,
    section: "Satış",
  },

  // ── ÜRÜNLER & STOK ──────────────────────────────────────────────────────
  {
    href: "/products",
    label: "Ürünler",
    iconKey: "package",
    permission: PERMISSIONS.PRODUCTS_READ,
    section: "Ürünler & Stok",
  },
  {
    href: "/categories",
    label: "Kategoriler",
    iconKey: "folderTree",
    permission: PERMISSIONS.CATEGORIES_READ,
    section: "Ürünler & Stok",
  },
  {
    href: "/search",
    label: "Ürün Arama",
    iconKey: "search",
    permission: PERMISSIONS.SEARCH_READ,
    section: "Ürünler & Stok",
  },
  {
    href: "/admin/stock-health",
    label: "Stok Sağlığı",
    iconKey: "heart",
    permission: PERMISSIONS.EXECUTIVE_READ,
    section: "Ürünler & Stok",
  },
  {
    href: "/warehouse",
    label: "Depo",
    iconKey: "warehouse",
    permission: PERMISSIONS.INVENTORY_READ,
    section: "Ürünler & Stok",
  },
  {
    href: "/warehouse/count",
    label: "Stok Sayımı",
    iconKey: "box",
    permission: PERMISSIONS.INVENTORY_COUNT,
    section: "Ürünler & Stok",
  },

  // ── PAZARYERLERİ ────────────────────────────────────────────────────────
  // İşlem ekranları + yapılandırma alt-grubu.
  {
    href: "/marketplace/trendyol",
    label: "Trendyol Paneli",
    iconKey: "cart",
    permission: PERMISSIONS.MARKETPLACE_LISTINGS_READ,
    section: "Pazaryerleri",
  },
  {
    href: "/marketplace",
    label: "Pazaryerleri",
    iconKey: "cart",
    permission: PERMISSIONS.MARKETPLACE_LISTINGS_READ,
    section: "Pazaryerleri",
  },
  {
    href: "/marketplace/trendyol/questions",
    label: "Müşteri Soruları",
    iconKey: "help",
    permission: PERMISSIONS.MARKETPLACE_QUESTIONS_READ,
    section: "Pazaryerleri",
  },
  {
    href: "/marketplace/trendyol/returns",
    label: "İade Merkezi",
    iconKey: "undo",
    permission: PERMISSIONS.MARKETPLACE_RETURNS_READ,
    section: "Pazaryerleri",
  },
  {
    href: "/marketplace/profit",
    label: "Kârlılık & Marj",
    iconKey: "pieChart",
    permission: PERMISSIONS.EXECUTIVE_READ,
    section: "Pazaryerleri",
  },
  {
    href: "/marketplace/return-analysis",
    label: "İade Analizi",
    iconKey: "trendingDown",
    permission: PERMISSIONS.MARKETPLACE_RETURNS_READ,
    section: "Pazaryerleri",
  },
  {
    href: "/admin/marketplace-mappings",
    label: "Ürün Eşleştirme",
    iconKey: "link",
    permission: PERMISSIONS.MARKETPLACE_MAPPINGS_READ,
    section: "Pazaryerleri",
  },
  // Alt grup: Yapılandırma
  {
    href: "/admin/marketplace-policies",
    label: "Marj Politikaları",
    iconKey: "settings",
    permission: PERMISSIONS.MARKETPLACE_POLICIES_MANAGE,
    section: "Pazaryerleri",
    subGroup: "Yapılandırma",
  },
  {
    href: "/admin/trendyol",
    label: "Trendyol API",
    iconKey: "key",
    permission: PERMISSIONS.EXECUTIVE_READ,
    section: "Pazaryerleri",
    subGroup: "Yapılandırma",
  },
  {
    href: "/admin/hepsiburada",
    label: "Hepsiburada API",
    iconKey: "key",
    permission: PERMISSIONS.EXECUTIVE_READ,
    section: "Pazaryerleri",
    subGroup: "Yapılandırma",
  },
  {
    href: "/admin/trendyol-catalog",
    label: "Trendyol Katalog",
    iconKey: "book",
    permission: PERMISSIONS.EXECUTIVE_READ,
    section: "Pazaryerleri",
    subGroup: "Yapılandırma",
  },
  {
    href: "/admin/xml-sync",
    label: "XML Senkron",
    iconKey: "refresh",
    permission: PERMISSIONS.EXECUTIVE_READ,
    section: "Pazaryerleri",
    subGroup: "Yapılandırma",
  },

  // ── İTHALAT ─────────────────────────────────────────────────────────────
  {
    href: "/admin/import-cockpit",
    label: "Karar Kokpiti",
    iconKey: "ship",
    permission: PERMISSIONS.EXECUTIVE_READ,
    section: "İthalat",
  },
  {
    href: "/admin/import-decisions",
    label: "İthalat Kararları",
    iconKey: "fileSearch",
    permission: PERMISSIONS.EXECUTIVE_READ,
    section: "İthalat",
  },
  {
    href: "/admin/import-calculator",
    label: "İthalat Hesaplayıcı",
    iconKey: "calculator",
    permission: PERMISSIONS.EXECUTIVE_READ,
    section: "İthalat",
  },
  {
    href: "/admin/procurement",
    label: "Tedarik Asistanı",
    iconKey: "handshake",
    permission: PERMISSIONS.EXECUTIVE_READ,
    section: "İthalat",
  },
  {
    href: "/admin/purchase-orders",
    label: "Satın Alma Siparişleri",
    iconKey: "cart",
    permission: PERMISSIONS.EXECUTIVE_READ,
    section: "İthalat",
  },
  {
    href: "/admin/suppliers",
    label: "Tedarikçiler",
    iconKey: "truck",
    permission: PERMISSIONS.SUPPLIERS_READ,
    section: "İthalat",
  },

  // ── FİNANS ──────────────────────────────────────────────────────────────
  {
    href: "/admin/capital",
    label: "Sermaye Dağılımı",
    iconKey: "dollar",
    permission: PERMISSIONS.EXECUTIVE_READ,
    section: "Finans",
  },
  {
    href: "/admin/exchange-rates",
    label: "Döviz Kurları",
    iconKey: "trendingUp",
    permission: PERMISSIONS.EXCHANGE_RATES_MANAGE,
    section: "Finans",
  },
  {
    href: "/admin/product-performance",
    label: "Satış Performansı",
    iconKey: "chart",
    permission: PERMISSIONS.EXECUTIVE_READ,
    section: "Finans",
  },
  {
    href: "/admin/trendyol-report",
    label: "Trendyol Raporu",
    iconKey: "fileText",
    permission: PERMISSIONS.EXECUTIVE_READ,
    section: "Finans",
  },
  {
    href: "/marketplace/realized-margin",
    label: "Gerçekleşen Marj",
    iconKey: "ruler",
    permission: PERMISSIONS.EXECUTIVE_READ,
    section: "Finans",
  },
  {
    href: "/admin/trendyol-matching",
    label: "Satış Eşleştirme",
    iconKey: "crosshair",
    permission: PERMISSIONS.EXECUTIVE_READ,
    section: "Finans",
  },

  // ── SİSTEM ──────────────────────────────────────────────────────────────
  {
    href: "/admin/users",
    label: "Kullanıcılar",
    iconKey: "user",
    permission: PERMISSIONS.USERS_READ,
    section: "Sistem",
  },
  {
    href: "/orders",
    label: "Siparişler",
    iconKey: "archive",
    permission: PERMISSIONS.EXECUTIVE_READ,
    section: "Sistem",
  },
  {
    href: "/yardim/glosari",
    label: "Glosari & Terimler",
    iconKey: "book",
    section: "Sistem",
  },
];

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();

  const navChecks = await Promise.all(
    ALL_NAV.map(async (item) => {
      const allowed =
        !item.permission || (await checkPermission(user, item.permission));
      return allowed
        ? {
            href: item.href,
            label: item.label,
            section: item.section,
            subGroup: item.subGroup,
            iconKey: item.iconKey,
          }
        : null;
    }),
  );
  const allowedNav = navChecks.filter(Boolean) as NavItem[];

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
              <CommandPalette />
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
