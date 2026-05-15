import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { LogoutButton } from "@/components/dashboard/logout-button";
import { MobileNavButton } from "@/components/dashboard/mobile-nav-button";
import { Sidebar, type NavItem } from "@/components/dashboard/sidebar";
import { requireUser, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";

// Full navigation definition. Each entry declares the permission required to see it.
// Dashboard has no permission guard — it adapts its own content per user.
const ALL_NAV: Array<NavItem & { permission?: string }> = [
  { href: "/dashboard",  label: "Pano" },
  { href: "/customers",  label: "Müşteriler",  permission: PERMISSIONS.CUSTOMERS_READ },
  { href: "/quotes",     label: "Teklifler",   permission: PERMISSIONS.QUOTES_READ },
  { href: "/tasks",      label: "Görevler",    permission: PERMISSIONS.TASKS_READ },
  { href: "/products",   label: "Ürünler",     permission: PERMISSIONS.PRODUCTS_READ },
  { href: "/categories", label: "Kategoriler", permission: PERMISSIONS.CATEGORIES_READ },
  { href: "/search",     label: "Arama",       permission: PERMISSIONS.SEARCH_READ },
  { href: "/campaigns",  label: "Kampanyalar", permission: PERMISSIONS.CAMPAIGNS_READ },
  { href: "/activity",   label: "Aktiviteler", permission: PERMISSIONS.ACTIVITY_READ },
  { href: "/admin/users", label: "Kullanıcılar", permission: PERMISSIONS.USERS_READ },
];

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();

  // Compute which nav items this user is allowed to see.
  const navChecks = await Promise.all(
    ALL_NAV.map(async (item) => {
      const allowed = !item.permission || (await checkPermission(user, item.permission));
      return allowed ? { href: item.href, label: item.label } : null;
    }),
  );
  const allowedNav = navChecks.filter((item): item is NavItem => item !== null);

  // Users with zero non-dashboard items have effectively no access — send to no-access page.
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
                <h2 className="text-lg font-semibold text-slate-950">{user.name}</h2>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden rounded-xl border border-slate-200 bg-white px-4 py-2 text-right md:block">
                <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Hesap</p>
                <p className="text-sm font-medium text-slate-800">{user.email}</p>
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
