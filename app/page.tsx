import type { Metadata } from "next";
import Link from "next/link";

/**
 * iotomasyon.com KÖK SAYFASI — PDKS (Personel Devam Takip) SaaS satış landing'i.
 *
 * Eski kök (Alfa Soylu Depo Arama + panel girişi) /alfas'a taşındı.
 * Bu sayfa Google'a AÇIKTIR (index, follow) — yeni müşterilerin bulması için.
 *
 * NOT (Faz 2): Self-servis kayıt + online abonelik ödeme henüz kurulmadı.
 * Fiyat tablosundaki tutarlar PLACEHOLDER'dır; CTA'lar şimdilik #iletisim'e
 * gider. Ödeme sağlayıcısı seçilince planlar /kayit akışına bağlanacak.
 */
export const metadata: Metadata = {
  title: "iotomasyon PDKS — Konum Doğrulamalı Personel Devam Takip",
  description:
    "Sahada personel giriş/çıkış takibi: konum doğrulamalı (geofence) check-in, otomatik çıkış, izin yönetimi ve aylık puantaj raporu. Kurulum gerektirmeyen PWA. Aylık abonelik.",
  keywords: [
    "PDKS",
    "personel devam takip",
    "puantaj programı",
    "saha personel takibi",
    "geofence giriş çıkış",
    "personel takip uygulaması",
  ],
  robots: { index: true, follow: true },
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "tr_TR",
    siteName: "iotomasyon PDKS",
    title: "iotomasyon PDKS — Konum Doğrulamalı Personel Devam Takip",
    description:
      "Konum doğrulamalı check-in, otomatik çıkış, izin yönetimi ve aylık puantaj. Kurulum gerektirmeyen PWA.",
  },
};

const FEATURES: Array<{ icon: string; title: string; desc: string }> = [
  {
    icon: "📍",
    title: "Konum doğrulamalı giriş",
    desc: "Geofence ile personel yalnızca şantiye/iş yeri çevresindeyken giriş yapabilir. Karar daima sunucuda verilir — kandırılamaz.",
  },
  {
    icon: "⏱️",
    title: "Otomatik çıkış & hatırlatma",
    desc: "Mesai bitince push hatırlatması; çıkış unutulursa beklenen saatte otomatik kapanış. Geç kalanlara dakikalık uyarı.",
  },
  {
    icon: "🏖️",
    title: "İzin yönetimi",
    desc: "Personel izin talep eder, yönetici onaylar. Onaylı izin günlerinde uyarı ve otomatik çıkış devreye girmez.",
  },
  {
    icon: "📊",
    title: "Aylık puantaj & bordro",
    desc: "Çalışılan saat, fazla mesai, geç giriş, devamsızlık otomatik hesaplanır. CSV olarak muhasebeye aktarın.",
  },
  {
    icon: "🔔",
    title: "Push bildirimleri",
    desc: "App store gerekmez. Telefona 'ana ekrana ekle' ile kurulan PWA üzerinden anlık bildirim.",
  },
  {
    icon: "🗓️",
    title: "Program & resmi tatiller",
    desc: "Haftalık çalışma programı, kişi bazlı özel saatler ve Türkiye resmi tatil takvimi yerleşik gelir.",
  },
  {
    icon: "🔒",
    title: "Cihaz kilidi",
    desc: "Her personel tek cihaza bağlanır; başkasının yerine giriş (proxy check-in) engellenir.",
  },
  {
    icon: "🛡️",
    title: "KVKK uyumlu",
    desc: "Ham konum saklanmaz; yalnızca iş yerine olan mesafe tutulur. Konum işleme açık rıza ile başlar.",
  },
];

const PLANS: Array<{
  name: string;
  price: string;
  unit: string;
  highlight?: boolean;
  features: string[];
  cta: string;
}> = [
  {
    name: "Başlangıç",
    price: "₺499",
    unit: "/ay",
    features: ["10 personele kadar", "1 iş yeri/şantiye", "Konum doğrulama + otomatik çıkış", "Aylık puantaj raporu"],
    cta: "Başla",
  },
  {
    name: "Profesyonel",
    price: "₺999",
    unit: "/ay",
    highlight: true,
    features: ["50 personele kadar", "Sınırsız iş yeri", "İzin yönetimi + push bildirim", "CSV bordro ihracı", "Öncelikli destek"],
    cta: "Başla",
  },
  {
    name: "Kurumsal",
    price: "Özel",
    unit: "fiyat",
    features: ["Sınırsız personel", "Vardiya & onay hiyerarşisi", "ERP/bordro entegrasyonu", "SSO + denetim kaydı", "Özel SLA"],
    cta: "İletişime geç",
  },
];

const FAQ: Array<{ q: string; a: string }> = [
  {
    q: "Uygulama kurmak gerekiyor mu?",
    a: "Hayır. iotomasyon PDKS bir PWA'dır; personel tarayıcıdan açıp 'Ana ekrana ekle' der, uygulama gibi çalışır. App Store / Play Store gerekmez.",
  },
  {
    q: "iOS ve Android'de çalışır mı?",
    a: "Evet, her ikisinde de çalışır. Push bildirimleri iOS 16.4+ ve güncel Android sürümlerinde desteklenir.",
  },
  {
    q: "Konum verimiz saklanıyor mu?",
    a: "Ham koordinat saklanmaz; yalnızca iş yerine olan mesafe tutulur. Konum işleme personelin açık KVKK rızası ile başlar.",
  },
  {
    q: "Aboneliği istediğim zaman iptal edebilir miyim?",
    a: "Evet. Aylık aboneliktir; dilediğiniz zaman iptal edebilirsiniz. Dönem sonuna kadar erişiminiz devam eder.",
  },
];

export default function PdksLandingPage() {
  return (
    <div className="min-h-screen scroll-smooth bg-white text-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-sm font-bold text-white">
              io
            </span>
            <span className="text-sm font-semibold tracking-tight">
              iotomasyon <span className="text-blue-600">PDKS</span>
            </span>
          </Link>
          <nav className="flex items-center gap-2 text-sm">
            <a href="#ozellikler" className="hidden rounded-lg px-3 py-1.5 text-slate-600 hover:text-slate-900 sm:inline">
              Özellikler
            </a>
            <a href="#fiyatlar" className="hidden rounded-lg px-3 py-1.5 text-slate-600 hover:text-slate-900 sm:inline">
              Fiyatlar
            </a>
            <Link href="/personel" className="rounded-lg px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-100">
              Personel Girişi
            </Link>
            <Link
              href="/login"
              className="rounded-lg bg-slate-900 px-3 py-1.5 font-medium text-white transition hover:bg-slate-700"
            >
              Yönetici Girişi
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-slate-50 to-white">
        <div className="mx-auto max-w-6xl px-4 py-20 text-center sm:py-28">
          <span className="inline-block rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
            Saha ve şantiye ekipleri için PDKS
          </span>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
            Personel devam takibini <span className="text-blue-600">konumla</span> kanıtlayın
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-7 text-slate-600">
            Geofence ile doğrulanmış giriş/çıkış, otomatik çıkış, izin yönetimi ve aylık puantaj.
            Kurulum gerektirmez — telefondan açın, çalışmaya başlayın.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href="#iletisim"
              className="w-full rounded-xl bg-blue-600 px-7 py-3.5 text-center text-base font-semibold text-white shadow-sm transition hover:bg-blue-700 sm:w-auto"
            >
              Ücretsiz Deneyin
            </a>
            <a
              href="#ozellikler"
              className="w-full rounded-xl border border-slate-300 px-7 py-3.5 text-center text-base font-semibold text-slate-700 transition hover:bg-slate-50 sm:w-auto"
            >
              Özellikleri Gör
            </a>
          </div>
          <p className="mt-4 text-xs text-slate-400">Kredi kartı gerekmez · Dakikalar içinde kurulum</p>
        </div>
      </section>

      {/* Features */}
      <section id="ozellikler" className="mx-auto max-w-6xl px-4 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight">İhtiyacınız olan her şey</h2>
          <p className="mt-3 text-slate-600">Saha personeli takibini baştan sona kapsayan tek panel.</p>
        </div>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl border border-slate-200 p-6 transition hover:shadow-md">
              <div className="text-2xl">{f.icon}</div>
              <h3 className="mt-4 text-base font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="fiyatlar" className="bg-slate-50 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight">Basit, aylık fiyatlandırma</h2>
            <p className="mt-3 text-slate-600">Taahhüt yok. İstediğiniz zaman iptal edin.</p>
          </div>
          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {PLANS.map((p) => (
              <div
                key={p.name}
                className={`relative rounded-2xl border bg-white p-8 ${
                  p.highlight ? "border-blue-600 shadow-lg ring-1 ring-blue-600" : "border-slate-200"
                }`}
              >
                {p.highlight && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-blue-600 px-3 py-1 text-xs font-semibold text-white">
                    En popüler
                  </span>
                )}
                <h3 className="text-lg font-semibold">{p.name}</h3>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-4xl font-bold tracking-tight">{p.price}</span>
                  <span className="text-sm text-slate-500">{p.unit}</span>
                </div>
                <ul className="mt-6 space-y-3 text-sm">
                  {p.features.map((feat) => (
                    <li key={feat} className="flex items-start gap-2 text-slate-600">
                      <span className="mt-0.5 text-blue-600">✓</span>
                      {feat}
                    </li>
                  ))}
                </ul>
                <a
                  href="#iletisim"
                  className={`mt-8 block rounded-xl px-5 py-3 text-center text-sm font-semibold transition ${
                    p.highlight
                      ? "bg-blue-600 text-white hover:bg-blue-700"
                      : "border border-slate-300 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {p.cta}
                </a>
              </div>
            ))}
          </div>
          <p className="mt-6 text-center text-xs text-slate-400">
            Fiyatlara KDV dahil değildir. Tutarlar bilgilendirme amaçlıdır; kesin fiyat için iletişime geçin.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-4 py-20">
        <h2 className="text-center text-3xl font-bold tracking-tight">Sık sorulan sorular</h2>
        <div className="mt-10 space-y-4">
          {FAQ.map((item) => (
            <details key={item.q} className="group rounded-xl border border-slate-200 p-5">
              <summary className="cursor-pointer list-none text-base font-medium text-slate-900 marker:hidden">
                <span className="flex items-center justify-between gap-4">
                  {item.q}
                  <span className="text-slate-400 transition group-open:rotate-45">+</span>
                </span>
              </summary>
              <p className="mt-3 text-sm leading-6 text-slate-600">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA / Contact */}
      <section id="iletisim" className="bg-slate-900 py-20 text-white">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <h2 className="text-3xl font-bold tracking-tight">Ekibinizi bugün takibe alın</h2>
          <p className="mx-auto mt-4 max-w-xl text-slate-300">
            Demo talebi veya sorularınız için bize ulaşın. Hesabınızı sizin için hazırlayalım.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href="mailto:info@iotomasyon.com?subject=PDKS%20Demo%20Talebi"
              className="w-full rounded-xl bg-blue-600 px-7 py-3.5 text-center font-semibold text-white transition hover:bg-blue-700 sm:w-auto"
            >
              Demo Talep Et
            </a>
            <Link
              href="/personel"
              className="w-full rounded-xl border border-slate-600 px-7 py-3.5 text-center font-semibold text-slate-200 transition hover:bg-slate-800 sm:w-auto"
            >
              Personel Girişi
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 text-sm text-slate-500 sm:flex-row">
          <span>© {new Date().getFullYear()} iotomasyon PDKS</span>
          <nav className="flex items-center gap-4">
            <a href="#fiyatlar" className="hover:text-slate-900">Fiyatlar</a>
            <a href="#iletisim" className="hover:text-slate-900">İletişim</a>
            <Link href="/alfas" rel="nofollow" className="hover:text-slate-900">Alfa Soylu</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
