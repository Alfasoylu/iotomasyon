import { BookOpen } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";

export const dynamic = "force-static";

interface Term {
  term: string;
  shortFor?: string;
  definition: string;
  example?: string;
}

interface TermGroup {
  title: string;
  description: string;
  terms: Term[];
}

const GROUPS: TermGroup[] = [
  {
    title: "Satış & Stok",
    description: "Ürün hareketi ve stok seviyesi metrikleri",
    terms: [
      {
        term: "T30G",
        shortFor: "Son 30 Gün",
        definition: "Son 30 gün içinde Trendyol'da satılan adet (iptaller hariç).",
        example: "T30G = 12 → bu üründen geçen 30 günde 12 adet satılmış.",
      },
      {
        term: "Lifetime / Toplam",
        definition: "Trendyol'da tüm zamanlardaki toplam satış adedi (iptaller hariç).",
      },
      {
        term: "Aylık Pot. / Manuel",
        definition: "Pazaryeri için manuel girdiğin aylık satış tahmini. İthalat kararında max(forecast, manuel) kullanılır.",
        example: "Manuel = 50, sistem tahmini = 20 → effectiveMonthly = 50.",
      },
      {
        term: "Tahmin",
        definition: "Sistem tahmin motoru — tüm 14 kanaldan + 5 yıllık tarihçeden recency-weighted (90d×0.5 + 365d×0.3 + lifetime×0.2) + mevsimsel düzeltme.",
      },
      {
        term: "Stok Günü",
        definition: "Mevcut stokun kaç gün yeteceği (stockQuantity / aylık satış × 30). 14g altı = acil sipariş.",
      },
      {
        term: "Effective Monthly",
        definition: "İthalat kararında kullanılan aylık talep sinyali = max(sistem tahmini, manuel onlineSalesPotential).",
      },
    ],
  },
  {
    title: "Kâr & Marj",
    description: "Trendyol satışlarındaki kâr/zarar hesabı",
    terms: [
      {
        term: "Komisyon",
        definition: "Pazaryeri (Trendyol/Hepsiburada) ürün satışından aldığı pay. Varsayılan %20, gerçek ortalama Trendyol %16.5, Hepsiburada %12.8.",
      },
      {
        term: "Kargo Dilimi",
        definition: "Pazaryeri kanonik kargo formülü: ürün fiyatına göre $1.2 / $2 / $3.3 (₺ olarak USD kurundan).",
        example: "$5 altı ürün → $1.2 × kur. $5–7.5 → $2 × kur. >$7.5 → $3.3 × kur.",
      },
      {
        term: "Net Kâr",
        definition: "(Satış fiyatı − komisyon − kargo) − maliyet. KDV cash-flow dahil — VAT çıkarılmaz.",
      },
      {
        term: "Marj %",
        definition: "Net kâr / toplam maliyet × 100. 'Alış fiyatını yüzde kaç büyüttün' anlamına gelir.",
        example: "Maliyet $10, net kâr $4 → marj %40.",
      },
      {
        term: "ROI",
        shortFor: "Return on Investment",
        definition: "Yatırım getirisi. Net kâr / maliyet × 100.",
      },
      {
        term: "Yıllık ROI",
        definition: "ROI birleşik formülü ile 12 aya projeksiyon: ratio^(365/cycleDays). cycleDays = AIR 150g / SEA 210g.",
      },
    ],
  },
  {
    title: "İthalat",
    description: "Maliyet, kargo, gümrük",
    terms: [
      {
        term: "Alış (¥)",
        definition: "Çin tedarikçi fiyatı (RMB / Yuan).",
      },
      {
        term: "Freight",
        definition: "Çin'den gelen kargo (USD). AIR $8/kg, SEA $1/kg.",
      },
      {
        term: "Customs / Gümrük",
        definition: "Türkiye gümrük vergisi yüzdesi. Default %30.",
      },
      {
        term: "Payment Fee",
        definition: "Çin'e ödeme yaparken havale/komisyon fee'si (RMB tutarına yüzde olarak eklenir).",
      },
      {
        term: "AIR / SEA",
        definition: "Çin'den getirme yöntemi. AIR = hava kargo (hızlı, pahalı, 150 gün döngü). SEA = deniz kargo (yavaş, ucuz, 210 gün döngü).",
      },
      {
        term: "Otomatik Kargo Seçimi",
        definition: "Kullanıcı tercihi yoksa sistem AIR ve SEA için ayrı ROI hesaplar, daha yüksek olanı seçer. Veri eksikse ≥5kg → SEA fallback.",
      },
      {
        term: "Cycle Days / Döngü",
        definition: "İthal edip satıp tekrar para döndürme süresi. AIR 150g, SEA 210g. Yıllık ROI hesabında etken.",
      },
    ],
  },
  {
    title: "Sermaye & Karar",
    description: "Sermaye Sağlığı + ithalat karar sinyalleri",
    terms: [
      {
        term: "Bağlı Sermaye",
        definition: "Ürünlere kilitli toplam para. Her ürün: unitCost × stock. USD bazlı.",
      },
      {
        term: "Aylık Beklenen Nakit",
        definition: "Σ(net kâr × aylık satış). Sadece kârlı ürünler dahil — zarara çalışanlar 0 sayılır.",
      },
      {
        term: "Ölü Stok",
        definition: "Hiç satılmamış (lifetime = 0) ama stoğu olan ürünlerin toplam bağlı sermayesi.",
      },
      {
        term: "Likidasyon Adayı",
        definition: "Daha önce satılmış ama son 30 gün hareket etmemiş ürünler. İndirim / tasfiye düşün.",
      },
      {
        term: "Acil Sipariş",
        definition: "Stoku 14 günden az kalan ürünler — hemen Çin siparişi ver.",
      },
      {
        term: "Sermaye Sağlık Skoru",
        definition: "0-100 manşet skor. ROI 50pt + Ölü stok 25pt + Acil sipariş 10pt + Likidasyon 15pt. ≥75 Mükemmel, ≥55 İyi, ≥35 Dikkat, <35 Kritik.",
      },
      {
        term: "AL / BEKLE / ALMA",
        definition: "Karar Kokpiti sinyali. AL = anlık ekonomi iyi. BEKLE = veri eksik veya marj sınırda. ALMA = zarara çalışır.",
      },
    ],
  },
  {
    title: "Pazaryerleri & Kanallar",
    description: "Trendyol, Hepsiburada ve diğer 12 kanal",
    terms: [
      {
        term: "Marketplace / Pazaryeri",
        definition: "Trendyol, Hepsiburada, N11, Pazarama, Amazon, Ideasoft (kendi siten), GG (GittiGidiyor — kapatıldı), Idefix, Çiçeksepeti, Temu, Mirakl_Koctas, Mirakl_Teknosa, Shopphp.",
      },
      {
        term: "Pazaryeri push",
        definition: "Stok/fiyat/listeleme verisini pazaryerine gönderme. iotomasyon CRM ASLA push yapmaz — Entegra adlı program yapar (immutable kural).",
      },
      {
        term: "Eşleşmemiş Sipariş",
        definition: "Trendyol/HB'den gelen satış kaydının iotomasyon ürünüyle eşleştirilmemiş olması. SKU/barkod/ad benzerliği ile düzeltilir.",
      },
      {
        term: "Eksik Listeme",
        definition: "Stoğunda var ama Trendyol'da listede olmayan ürün. Trendyol Katalog sayfasında görünür.",
      },
      {
        term: "İade Oranı",
        definition: "Toplam siparişe oran olarak iade adedi. Pazaryeri marj hesabında düşülür.",
      },
    ],
  },
];

export default function GlossaryPage() {
  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        icon={BookOpen}
        breadcrumb={[{ label: "Yardım" }, { label: "Glosari" }]}
        title="Glosari & Terimler"
        subtitle="Sistemde kullanılan kısaltma ve terim açıklamaları. T30G, ROI, Marj, AIR/SEA — hangi sayfada ne anlama geliyor."
      />

      {GROUPS.map((group, gi) => (
        <Card key={gi} className="overflow-hidden p-0">
          <div className="border-b border-slate-100 bg-slate-50 px-5 py-3">
            <h2 className="text-sm font-semibold text-slate-900">{group.title}</h2>
            <p className="mt-0.5 text-xs text-slate-500">{group.description}</p>
          </div>
          <div className="divide-y divide-slate-100">
            {group.terms.map((t, i) => (
              <div key={i} className="px-5 py-4">
                <div className="flex flex-wrap items-baseline gap-2">
                  <h3 className="font-mono text-sm font-semibold text-slate-900">
                    {t.term}
                  </h3>
                  {t.shortFor && (
                    <span className="text-xs text-slate-500">
                      ({t.shortFor})
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-700">
                  {t.definition}
                </p>
                {t.example && (
                  <p className="mt-1.5 text-xs italic text-slate-500">
                    Örnek: {t.example}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Card>
      ))}

      <Card className="border-blue-200 bg-blue-50 p-5">
        <p className="text-sm leading-relaxed text-blue-900">
          <strong>📚 İpucu:</strong> Tablolarda altı noktalı çizgili yazıların üzerine gelirsen kısaltmanın açılımını görürsün
          (örn. <span className="cursor-help underline decoration-dotted decoration-blue-500 underline-offset-2">T30G</span>).
          Daha fazla terim eklenmeli mi? Yöneticiye söyle.
        </p>
      </Card>
    </div>
  );
}
