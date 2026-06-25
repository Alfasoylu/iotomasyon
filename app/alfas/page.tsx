import type { Metadata } from "next";

import { getCurrentSession } from "@/lib/auth";
import { PublicHeader } from "@/components/public/public-header";
import { DepoSearch } from "@/components/public/depo-search";

export const dynamic = "force-dynamic";

/**
 * /alfas — Alfa Soylu Elektronik public Depo Arama + panel girişi.
 *
 * Önceden kök (`/`) sayfasıydı; iotomasyon.com kökü PDKS satış landing'ine
 * dönüştürülünce buraya taşındı. İçerik aynı: anonim arama ekranı, sağ üstte
 * session durumuna göre "Giriş" / "Panele Dön".
 *
 * SEO: Bu sayfa Google'a KAPALIDIR (noindex, nofollow) — yalnızca linki/QR'ı
 * bilenler erişir. Korunan panel rotaları (/products, /admin/*) kendi
 * `requirePermission()` çağrılarıyla auth zorunlu tutar; bu sayfa onlardan
 * bağımsızdır.
 */
export const metadata: Metadata = {
  title: "Alfa Soylu Elektronik — B2B Toptan Katalog",
  description:
    "Güvenlik kameraları, elektronik sistemler ve montaj çözümleri. B2B toptan katalog, fiyat teklifi ve dijital sipariş yönetimi.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/alfas" },
};

export default async function AlfasHomePage() {
  const session = await getCurrentSession();

  return (
    <div className="min-h-screen bg-slate-50">
      <PublicHeader sessionEmail={session?.email ?? null} />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
        <h1 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
          Depo Arama
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Stok kodu, barkod veya ürün adı ile ara — fotoğraf ve güncel stok adeti.
        </p>
        <div className="mt-6">
          <DepoSearch />
        </div>
      </main>
    </div>
  );
}
