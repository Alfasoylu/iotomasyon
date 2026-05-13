"use client";

import { Button } from "@/components/ui/button";
import { useSidebarStore } from "@/hooks/use-sidebar-store";

export function MobileNavButton() {
  const { setMobileOpen } = useSidebarStore();

  return (
    <Button variant="secondary" className="md:hidden" onClick={() => setMobileOpen(true)}>
      Menu
    </Button>
  );
}
