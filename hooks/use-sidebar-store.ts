"use client";

import { create } from "zustand";

type SidebarStore = {
  mobileOpen: boolean;
  setMobileOpen: (value: boolean) => void;
};

export const useSidebarStore = create<SidebarStore>((set) => ({
  mobileOpen: false,
  setMobileOpen: (value) => set({ mobileOpen: value }),
}));
