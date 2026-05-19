/**
 * lib/help-content.ts — Sayfa başına yardım içeriği
 *
 * HelpDrawer "Bu sayfa nedir?" butonuna tıklayınca açılan içerik. Her sayfa
 * için: amaç (2 cümle), alan açıklamaları, sıkça yapılan işler.
 *
 * Yeni sayfa eklenirken bu dosyaya kayıt eklenir. Sayfada `<HelpButton pageKey="..." />`
 * kullanılır.
 */

export interface HelpField {
  label: string;
  desc: string;
}

export interface HelpTask {
  title: string;
  steps: string[];
}

export interface PageHelp {
  /** Sayfa adı (drawer başlığı) */
  title: string;
  /** 2-3 cümlelik amaç açıklaması */
  purpose: string;
  /** Tabloda/sayfada görünen önemli alanların açıklaması */
  fields?: HelpField[];
  /** Bu sayfada yapabileceğin tipik 2-4 iş */
  tasks?: HelpTask[];
  /** Glosari'ye link verilecek ekstra terimler */
  relatedTerms?: string[];
}

export const PAGE_HELP: Record<string, PageHelp> = {
  dashboard: {
    title: "Pano (Dashboard)",
    purpose:
      "Günde 1 kez aç, 5 saniyede 'bugün ne yapmalıyım' sorusuna cevap bul. Manşet Sermaye Sağlık Skoru tek bakışta durumu verir; altındaki kartlar Satış / Pazaryerleri / Stok / Finans alanlarında özet ve detay sayfalarına link sunar.",
    fields: [
      { label: "Sermaye Sağlık Skoru", desc: "0–100 manşet. ROI 50pt + Ölü Stok 25pt + Acil Sipariş 10pt + Likidasyon 15pt." },
      { label: "Akıllı Öneriler", desc: "Sistem makinece 4-8 aksiyon önerir — yıldız ürünler, acil sipariş, ölü stok, dormant müşteri vb." },
      { label: "Bugün Görev", desc: "Vadesi bugün olan görevler. Gecikmiş varsa kırmızı rozetle gösterilir." },
    ],
    tasks: [
      {
        title: "Manşet skoru kontrol et",
        steps: ["Üstte Sermaye Sağlık Skoru kartına bak", "Tıklarsan /admin/sermaye-saglik'e gider", "Skor düşükse detayda hangi bileşen sorunlu görürsün"],
      },
      {
        title: "Acil işlere bak",
        steps: ["Akıllı Öneriler kartında 🔴 rozetli öneriler en kritik", "Tıkla → ilgili ürün/müşteri sayfası açılır", "Aksiyon al"],
      },
    ],
    relatedTerms: ["Sermaye Sağlık Skoru", "ROI", "Stok Günü"],
  },

  "admin/sermaye-saglik": {
    title: "Sermaye Sağlığı Panosu",
    purpose:
      "USD bazlı tek bakışta günlük durum: paranın nereye bağlı, bu ay ne kadar nakit beklenir, neyi siparişe vermeli, neyi tasfiye etmeli. Üstte 0–100 skor; altta KPI'lar, kategori dağılımı ve 4 aksiyon listesi.",
    fields: [
      { label: "Bağlı Sermaye", desc: "Toplam unitCost × stock (USD). Ürünlere kilitli para." },
      { label: "Aylık Beklenen Nakit", desc: "Σ(net kâr × aylık satış). Sadece kârlı ürünler dahil." },
      { label: "Yıllık ROI", desc: "Aylık × 12 / bağlı sermaye. Mevcut hızda 12 aylık projeksiyon." },
      { label: "Ölü Stok", desc: "Lifetime satışı 0 olan ama stoğu olan ürünlerin toplam bağlı sermayesi." },
    ],
    tasks: [
      {
        title: "Acil sipariş listesini CSV indir",
        steps: ["🔴 Acil Sipariş kartının başlığında '⬇ CSV indir'", "Excel'de aç, tedarikçiye gönder"],
      },
      {
        title: "Ölü stoğu tasfiye et",
        steps: ["🟡 Ölü Stok kartındaki ürünleri incele", "Hangileri 6 aydır satılmıyor?", "İndirim/promo başlat"],
      },
    ],
    relatedTerms: ["Sermaye Sağlık Skoru", "Ölü Stok", "Likidasyon Adayı"],
  },

  products: {
    title: "Ürün Kataloğu",
    purpose:
      "Tüm aktif ürünler, stok seviyeleri, fiyatlar ve pazaryeri/ithalat bilgileri. İthalatçı görünümünde kâr-marj, ROI, tahmin ve karar sinyalleri görünür.",
    fields: [
      { label: "T30G", desc: "Son 30 günde tüm kanallardan satış adedi (iptaller hariç)." },
      { label: "Toplam (Lifetime)", desc: "Tüm zamanlardaki toplam satış adedi." },
      { label: "Tahmin", desc: "Sistem tahmini aylık satış. Recency-weighted blend (90d×0.5 + 365d×0.3 + lifetime×0.2) × mevsimsel." },
      { label: "Manuel", desc: "Senin girdiğin aylık satış tahmini. İthalat kararında max(Tahmin, Manuel) kullanılır." },
      { label: "Aylık Kâr ($)", desc: "Net kâr × effectiveMonthlyUnits. Bir ürünün ayda kaç dolar kazandırdığı." },
    ],
    tasks: [
      {
        title: "İthalatçı görünümüne geç",
        steps: ["Üstteki tablo başlığında 'İthalatçı Görünümü' seçeneğine tıkla", "Kâr-marj-ROI kolonları açılır"],
      },
      {
        title: "Tablo başlığını sticky tut",
        steps: ["Aşağı kaydırırken başlık satırı üstte sabit kalır", "Hangi kolon ne anlama geliyor unutmazsın"],
      },
    ],
    relatedTerms: ["T30G", "Tahmin", "Aylık Kâr"],
  },

  "admin/import-cockpit": {
    title: "İthalat Karar Kokpiti",
    purpose:
      "Hangi üründen sipariş vermeli? Trendyol gerçek satış fiyatı + satış hızı + iade oranı + ithalat maliyetinden 'AL / BEKLE / ALMA / VERİ EKSİK' sinyali üretir. Üstteki legend kartında eşikler açıklar.",
    fields: [
      { label: "AL (yeşil)", desc: "Marj ≥ %25 ve aylık kâr > 0. Anlık ekonomi iyi, sipariş ver." },
      { label: "BEKLE (sarı)", desc: "Marj %15–25. Fiyat/maliyet iyileşmesini bekle." },
      { label: "ALMA (kırmızı)", desc: "Marj < %15 veya zarar. Sipariş verme." },
      { label: "VERİ EKSİK (gri)", desc: "Maliyet veya satış fiyatı eksik. Önce Ürün Eşleştirme'yi yap." },
    ],
    tasks: [
      {
        title: "Bu hafta sipariş listesi yap",
        steps: ["'AL' sekmesine tıkla", "Listeyi marj'a göre sırala", "Üstteki 'Sipariş Oluştur' butonu ile satın alma siparişi başlat"],
      },
    ],
    relatedTerms: ["AL/BEKLE/ALMA", "Marj %", "İade Oranı"],
  },

  marketplace: {
    title: "Pazaryerleri Genel Bakış",
    purpose:
      "14 satış kanalındaki bu ay performansı + tüm aktif listeleme kayıtları. Trendyol, Hepsiburada, N11, Pazarama, Amazon ve daha 9 kanal birleşik gösterilir.",
    fields: [
      { label: "Sipariş", desc: "Bu ay benzersiz sipariş adedi (iptal/iade hariç)." },
      { label: "Adet", desc: "Bu ay satılan ürün adedi (line item bazlı)." },
      { label: "Ciro", desc: "Bu ay toplam ciro (TRY)." },
      { label: "Pay", desc: "Bu kanalın toplam ciroya oranı." },
    ],
    tasks: [
      {
        title: "En iyi kanalını bul",
        steps: ["Tablo zaten ciro'ya göre sıralı", "Üstteki kanallar bu ay sana en çok kazandırıyor"],
      },
      {
        title: "Trendyol siparişlerine git",
        steps: ["Trendyol satırına tıkla", "Veya sidebar'dan 'Trendyol Paneli'"],
      },
    ],
    relatedTerms: ["Komisyon", "Eşleşmemiş Sipariş", "Pazaryeri push"],
  },

  customers: {
    title: "Müşteriler",
    purpose:
      "Tüm müşteri portföyün — kanban görünümüyle satış aşamasını takip et, kayıt aç, görev ata. Ticari (Vergi No'lu) müşteriler için pazaryeri satış geçmişi de görünür.",
    fields: [
      { label: "Durum (Kanban)", desc: "NEW → CONTACTED → QUOTED → NEGOTIATING → WON / LOST" },
      { label: "Tip", desc: "TOPTAN (B2B) / PERAKENDE / SİTE_YÖNETİCİSİ / GÜVENLİK_ŞİRKETİ / vb." },
      { label: "Source", desc: "Müşterinin nereden geldiği (Entegra import, manuel, vb.)" },
    ],
    tasks: [
      {
        title: "Yeni teklif ver",
        steps: ["Müşteri detayına tıkla", "Teklifler sekmesine geç", "Yeni teklif oluştur"],
      },
      {
        title: "Dormant ticari müşteri ile iletişime geç",
        steps: ["Dashboard'da Akıllı Öneriler kartında 👤 rozetli müşterilere bak", "Tıklayınca müşteri sayfası açılır", "Sağ rail'de geçmiş ciro + son sipariş tarihini gör"],
      },
    ],
    relatedTerms: ["Müşteri Kodu", "Vergi No", "Pazaryeri Satış Geçmişi"],
  },
};

export function getPageHelp(pageKey: string): PageHelp | null {
  return PAGE_HELP[pageKey] ?? null;
}
