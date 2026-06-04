import "server-only";

import { rgb } from "pdf-lib";

/**
 * Faz 2 — Endüstriyel-minimal PDF palet
 *
 * Eski orange/charcoal palet kaldırıldı. Yeni sistem CRM'deki dark token'larla
 * tutarlı: ink (text), neutral surfaces, accent yellow (sadece KEY moments için).
 *
 * Restraint kuralı: accent yellow PDF kağıdında çok az kullanılır — sadece
 *   - Cover'da 3 üst aksan çubuk (Faz 3'te eklenecek)
 *   - "Genel Toplam" box'ının sol şeridi (Faz 4'te)
 * Diğer her yer nötr (ink + greys).
 */
export const COLORS = {
  // ── Surfaces ──────────────────────────────────────────────────────
  paper:        rgb(1, 1, 1),                  // #ffffff — kağıt
  surface1:     rgb(0.98, 0.98, 0.98),         // #fafafa — alt blok (zebra yerine)
  surface2:     rgb(0.95, 0.95, 0.95),         // #f2f2f2 — section divider
  ink:          rgb(0.067, 0.067, 0.067),      // #111 — koyu blok (header bar, totals)

  // ── Text ──────────────────────────────────────────────────────────
  textPrimary:  rgb(0.067, 0.067, 0.067),      // #111 — birincil metin
  textBody:     rgb(0.22, 0.22, 0.22),         // #383838 — gövde metin
  textSecondary:rgb(0.4, 0.4, 0.4),            // #666 — ikincil
  textMuted:    rgb(0.6, 0.6, 0.6),            // #999 — caption / etiket
  textOnDark:   rgb(1, 1, 1),                  // beyaz — ink/charcoal üstünde
  captionOnDark:rgb(0.78, 0.78, 0.78),         // #c8c8c8 — ink üstünde muted

  // ── Borders ───────────────────────────────────────────────────────
  borderSubtle: rgb(0.91, 0.91, 0.91),         // #e8e8e8 — saç teli
  borderDefault:rgb(0.82, 0.82, 0.82),         // #d2d2d2 — varsayılan
  borderStrong: rgb(0.4, 0.4, 0.4),            // #666 — vurgu

  // ── Accent (Soylu electric yellow) — RESTRAINT, sadece KEY moments ─
  accent:       rgb(0.910, 1.000, 0.353),      // #e8ff5a
  accentInk:    rgb(0.067, 0.067, 0.067),      // accent üstünde text rengi
  accentDim:    rgb(0.973, 1.000, 0.831),      // #f8ffd4 — accent yumuşatılmış bg

  // ── Semantic — düşük doygunluk, dokunmadan vurgulu ────────────────
  ok:           rgb(0.165, 0.502, 0.275),      // #2a8047
  warn:         rgb(0.745, 0.451, 0.090),      // #be7317
  danger:       rgb(0.749, 0.235, 0.184),      // #bf3c2f

  // ── Legacy aliases (Faz 1 kodu kırılmasın diye — Faz 3'te silinecek) ─
  charcoal:     rgb(0.067, 0.067, 0.067),
  white:        rgb(1, 1, 1),
  slate900:     rgb(0.067, 0.067, 0.067),
  slate700:     rgb(0.22, 0.22, 0.22),
  slate500:     rgb(0.4, 0.4, 0.4),
  slate300:     rgb(0.78, 0.78, 0.78),
  slate200:     rgb(0.91, 0.91, 0.91),
  slate50:      rgb(0.98, 0.98, 0.98),
  orange:       rgb(0.067, 0.067, 0.067),       // → ink (sarı yerine siyah, restraint)
  orangeLight:  rgb(0.98, 0.98, 0.98),          // → surface1
} as const;

export type ColorKey = keyof typeof COLORS;
