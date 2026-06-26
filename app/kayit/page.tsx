import type { Metadata } from "next";
import Link from "next/link";

import { RegisterForm } from "@/components/pdks/register-form";

export const metadata: Metadata = {
  title: "Ücretsiz Deneme Başlat",
  description:
    "iotomasyon PDKS'i 30 gün ücretsiz deneyin. Şirketinizi kaydedin, çalışanlarınızı ekleyin, konum doğrulamalı devam takibine bugün başlayın.",
  alternates: { canonical: "/kayit" },
};

export default function KayitPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-sm font-bold text-white">io</span>
            <span className="text-sm font-semibold tracking-tight">iotomasyon <span className="text-blue-600">PDKS</span></span>
          </Link>
          <Link href="/personel" className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100">
            Zaten üye misiniz? Giriş
          </Link>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-10 px-4 py-12 lg:grid-cols-[1fr_1.1fr]">
        <section className="hidden lg:block">
          <h1 className="text-3xl font-bold tracking-tight text-slate-950">30 gün ücretsiz deneyin</h1>
          <p className="mt-4 text-slate-600">Kurulum gerektirmeyen PDKS. Birkaç dakikada şirketinizi kurun.</p>
          <ul className="mt-8 space-y-4 text-sm text-slate-700">
            {[
              "Konum doğrulamalı giriş/çıkış (geofence)",
              "Otomatik çıkış + geç kalma bildirimleri",
              "İzin yönetimi ve aylık puantaj",
              "Çalışanlar uygulamayı ana ekrana ekler — app store yok",
            ].map((t) => (
              <li key={t} className="flex items-start gap-2">
                <span className="mt-0.5 text-blue-600">✓</span>
                {t}
              </li>
            ))}
          </ul>
          <p className="mt-8 text-xs text-slate-400">Deneme sonunda Aylık ₺499 veya Yıllık ₺4.000. İstediğiniz zaman iptal.</p>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
          <h2 className="text-xl font-semibold tracking-tight text-slate-950 lg:hidden">30 gün ücretsiz deneyin</h2>
          <RegisterForm />
        </section>
      </main>
    </div>
  );
}
