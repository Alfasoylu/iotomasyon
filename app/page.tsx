import { getCurrentSession } from "@/lib/auth";
import { PublicHeader } from "@/components/public/public-header";
import { DepoSearch } from "@/components/public/depo-search";

export const dynamic = "force-dynamic";

/**
 * iotomasyon.com kök sayfası — public Depo Arama.
 *
 * Önceki davranış: login olmamış kullanıcı /login'e, login olmuş /dashboard'a
 * yönlendiriliyordu. Yeni davranış: anonim arama ekranı doğrudan açılır;
 * sağ üstte session durumuna göre "Giriş" veya "Panele Dön" linki gösterilir.
 *
 * Korunan rotalar (/products, /customers, /admin/*) hala kendi
 * `requirePermission()` çağrılarıyla auth zorunlu tutar — bu sayfa
 * onlardan bağımsız.
 */
export default async function HomePage() {
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
