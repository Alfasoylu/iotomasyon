/**
 * Slug yardımcıları — SAF modül.
 *
 * DİKKAT: Bu dosya bilerek hiçbir şey import etmez. `register-form.tsx` gibi
 * "use client" bileşenleri slugify'ı buradan alır. Daha önce slugify
 * `tenant-provision.ts` içindeydi; o dosya `server-only` + `@/lib/prisma`
 * (→ @prisma/adapter-pg → pg → dns/fs/net/tls) import ettiği için tüm Prisma
 * zinciri client bundle'ına giriyor ve production build'i kırıyordu.
 *
 * Buraya server-side bağımlılık EKLEMEYİN.
 */

/** Slug regex: 3-30, küçük harf/rakam/tire; baş-son tire yok. */
export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/;

/** Serbest metni slug adayına indirger (kullanıcıya öneri için). */
export function slugify(raw: string): string {
  return (raw ?? "")
    .toLowerCase()
    .trim()
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
}
