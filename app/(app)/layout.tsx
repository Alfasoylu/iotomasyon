import type { ReactNode } from "react";

import { LogoutButton } from "@/components/dashboard/logout-button";
import { MobileNavButton } from "@/components/dashboard/mobile-nav-button";
import { Sidebar } from "@/components/dashboard/sidebar";
import { requireUser } from "@/lib/auth";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-h-screen flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-[#f8f5ef]/90 px-4 py-4 backdrop-blur md:px-8">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <MobileNavButton />
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                  Internal workspace
                </p>
                <h2 className="text-lg font-semibold text-slate-950">{user.name}</h2>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden rounded-xl border border-slate-200 bg-white px-4 py-2 text-right md:block">
                <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Account</p>
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
