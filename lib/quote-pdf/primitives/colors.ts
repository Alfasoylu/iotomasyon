import "server-only";

import { rgb } from "pdf-lib";

/**
 * Faz 1 — Mevcut palet (görsel değişiklik yok)
 *
 * Faz 2'de bu paletin yerini yeni endüstriyel-minimal token sistemi alacak
 * (accent #e8ff5a, charcoal #0f0f0f, vb.). Şimdilik mevcut PDF'in birebir
 * görünmesi için eski paleti koruyoruz.
 */
export const COLORS = {
  charcoal:    rgb(0.067, 0.094, 0.153), // #111827
  orange:      rgb(0.976, 0.451, 0.086), // #F97316
  orangeLight: rgb(1.000, 0.969, 0.929), // #FFF7ED
  slate900:    rgb(0.100, 0.130, 0.200),
  slate700:    rgb(0.220, 0.260, 0.340),
  slate500:    rgb(0.400, 0.440, 0.520),
  slate300:    rgb(0.670, 0.710, 0.780),
  slate200:    rgb(0.840, 0.870, 0.920),
  slate50:     rgb(0.970, 0.970, 0.990),
  white:       rgb(1, 1, 1),
} as const;

export type ColorKey = keyof typeof COLORS;
