/**
 * İthalat Sipariş Önerisi — "sıradaki sipariş" kararının TEK yeri.
 *
 * NEDEN BURADA: aynı soru ("bir sonraki ithalatta ne alalım?") panelde sekiz ayrı
 * yerde, sekiz ayrı hesapla cevaplanıyordu — import-cockpit, import-decisions,
 * procurement, capital, ithalatçı görünümü, sermaye-sağlık, executive ve dashboard.
 * Hepsi Trendyol satışından kendi başına türetiyordu; hiçbiri CFO'nun fiilen karar
 * verdiği parti defterini (cfo_order_line) okumuyordu. Sayfa başına farklı cevap
 * çıkıyordu ve hangisinin doğru olduğu belli değildi.
 *
 * Bu bölüm algoritma çalıştırmaz: verilmiş kararları gösterir. Kaynak
 * `cfo_ithalat_oneri` / `cfo_ithalat_oneri_ozet` view'leri, onların kaynağı da
 * cfo_order_batch + cfo_order_line.
 *
 * NEDEN KAZANANLAR SAYFASINDA: "hangi ürün kâr getiriyor" ile "hangi ürünü tekrar
 * alalım" aynı karardır. Kârı getiren ürünün stoğu bitiyorsa kazanan liste bir
 * sonraki ay küçülür — iki tablo yan yana durmadıkça bu görünmüyor.
 *
 * ÜÇ ŞEY RAKAMLARIN YANINDA DURUYOR, çünkü tutar tek başına karar verdirmiyor:
 *   • NAKİT KAPISI — 30.08 kuralı: yurtdışı sipariş yalnız NAKİT ile verilir.
 *     Boş KMH ve kart limiti bu hesaba girmez. Kapı kapalıysa "tavsiye edilen
 *     tarih" diye bir şey yoktur; sayfa tarih uydurmaz, açığı yazar.
 *   • HAVA KÖPRÜSÜ — aynı SKU hem hava hem deniz listesinde olabilir. Bu mükerrer
 *     DEĞİL: hava şimdi yetiştirir, deniz asıl stoğu getirir. İşaretlenmezse
 *     iki kez sipariş verilir.
 *   • GECİKME — satırın "en geç sipariş tarihi" geçtiyse stoksuzluk artık
 *     kaçınılmaz; soru "ne zaman verelim" değil, "kaç gün stoksuz kalacağız".
 */
import Link from "next/link";
import { Ship, Plane, TriangleAlert, Target, ArrowRight } from "lucide-react";
import { fmtTry, fmtUsd, fmtNum, fmtDate, relDays } from "@/lib/cfo/format";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CfoTable, Th, Td } from "@/components/cfo/data-table";
import { QaRow, type PanelSorusu, type PanelKarari } from "@/components/cfo/row-qa-panel";

export type OneriSatiri = {
  mod: string;
  sku: string;
  product_name: string | null;
  priority: number | null;
  data_tag: string | null;
  kaynak_parti: string | null;
  reason: string | null;
  parti_adedi: number;
  onerilen_adet: number;
  min_adet_uygulandi: boolean;
  birim_maliyet_usd: unknown;
  tutar_usd: unknown;
  maliyet_eksik: boolean;
  aylik_satis: unknown;
  stok: number | null;
  tukenis_tarihi: Date | null;
  termin_gun: number;
  son_siparis_tarihi: Date | null;
  gecikti: boolean;
  tahmini_varis: Date | null;
  kapsam_ay: unknown;
  aylik_risk_kar_try: unknown;
  birim_fiyat_try: unknown;
  aylik_ciro_usd: unknown;
  kopru: boolean;
  karar: string | null;
  karar_sebep: string | null;
  karar_bitis: Date | null;
  haric: boolean;
  yolda_adet: number;
  yolda_eta: Date | null;
  yolda_parti: string | null;
  yolda_yeterli: boolean;
  sira: number;
};

/** Yoldaki partinin içeriğinin ne kadarı sisteme girilmiş. */
export type YoldakiKapsam = {
  kod: string;
  aciklama: string | null;
  durum: string;
  risk: string;
  eta: Date | null;
  beklenen_kalem: number | null;
  beklenen_adet: number | null;
  girilen_kalem: number;
  girilen_adet: number;
  kapsam_pct: unknown;
};

export type OneriOzeti = {
  mod: string;
  satir: number;
  toplam_adet: number;
  toplam_usd: unknown;
  toplam_try: unknown;
  maliyet_eksik_satir: number;
  gecikmis_satir: number;
  kopru_satir: number;
  haric_satir: number;
  yolda_satir: number;
  termin_gun: number;
  en_erken_tukenis: Date | null;
  en_erken_son_siparis: Date | null;
  ideal_siparis_tarihi: Date | null;
  min_tutar_usd: unknown;
  min_adet_kural: number;
  esik_karsilandi: boolean;
  esige_kalan_usd: unknown;
  bugunku_nakit_try: unknown;
  nakit_acigi_try: unknown;
  nakit_kapisi_tarihi: Date | null;
  projeksiyon_sonu: Date | null;
  projeksiyon_en_yuksek_nakit: unknown;
  tavsiye_siparis_tarihi: Date | null;
  tahmini_varis: Date | null;
  durum: string;
  aylik_ciro_usd: unknown;
  aylik_risk_kar_try: unknown;
  hedef_ciro_usd: unknown;
};

export type CiroHedefi = {
  ay: string;
  ciro_try: unknown;
  ciro_usd: unknown;
  hedef_usd: unknown;
  hedef_pct: unknown;
  acik_usd: unknown;
  gereken_kat: unknown;
  adet: unknown;
};

const n = (v: unknown) => (v == null ? 0 : Number(v));

const DURUM: Record<string, { etiket: string; variant: "ok" | "warn" | "danger" | "neutral"; ne: string }> = {
  HAZIR: {
    etiket: "Hazır",
    variant: "ok",
    ne: "Tutar eşiği ve nakit kapısı sağlandı — tavsiye edilen tarihte verilebilir.",
  },
  GECIKMIS: {
    etiket: "Gecikmiş",
    variant: "danger",
    ne: "En geç sipariş tarihi geçti. Bugün verilse bile stoksuz kalınan gün olacak.",
  },
  NAKIT_BEKLIYOR: {
    etiket: "Nakit bekliyor",
    variant: "warn",
    ne: "Sipariş tutarı bugünkü nakitten büyük. Projeksiyonda kapının açıldığı ilk gün bekleniyor.",
  },
  KAPI_KAPALI: {
    etiket: "Nakit kapısı kapalı",
    variant: "danger",
    ne: "Nakit projeksiyonu bu tutara hiç ulaşmıyor. Kural gereği KMH/kart ile sipariş verilmez.",
  },
  ESIK_ALTI: {
    etiket: "Eşik altı",
    variant: "warn",
    ne: "Parti minimum ithalat tutarının altında. Kalem birikene kadar bekletilir.",
  },
};

const MOD_META: Record<string, { ad: string; Icon: typeof Ship; aciklama: string }> = {
  HAVA: {
    ad: "Hava kargo",
    Icon: Plane,
    aciklama: "Kısa termin, yüksek navlun. Stoğu deniz yetiştiremeyen kalemler burada.",
  },
  DENIZ: {
    ad: "Deniz kargo",
    Icon: Ship,
    aciklama: "Uzun termin, ucuz navlun. Asıl stok buradan gelir.",
  },
};

function Uyari({ ton, children }: { ton: "danger" | "warn" | "info"; children: React.ReactNode }) {
  const cls =
    ton === "danger"
      ? "border-[var(--danger-border)] bg-[var(--danger-dim)] text-[var(--danger)]"
      : ton === "warn"
        ? "border-[var(--warn-border)] bg-[var(--warn-dim)] text-[var(--warn)]"
        : "border-[var(--border-default)] bg-[var(--surface-2)] text-[var(--text-secondary)]";
  return (
    <p className={`flex items-start gap-2 rounded-md border px-3 py-2 text-[11px] leading-snug ${cls}`}>
      <TriangleAlert size={13} className="mt-px shrink-0" />
      <span>{children}</span>
    </p>
  );
}

function Satir({ etiket, deger, ton }: { etiket: string; deger: string; ton?: "ok" | "danger" | "warn" }) {
  const renk =
    ton === "ok"
      ? "text-[var(--ok)]"
      : ton === "danger"
        ? "text-[var(--danger)]"
        : ton === "warn"
          ? "text-[var(--warn)]"
          : "text-[var(--text-primary)]";
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-[var(--border-subtle)] py-1.5 first:border-t-0">
      <span className="text-[11px] text-[var(--text-muted)]">{etiket}</span>
      <span className={`text-[12px] font-medium tabular-nums ${renk}`}>{deger}</span>
    </div>
  );
}

/** Bir taşıma modunun öneri kartı: tutar, tarih ve kuralların tek tek durumu. */
function ModKarti({ o }: { o: OneriOzeti }) {
  const meta = MOD_META[o.mod] ?? { ad: o.mod, Icon: Ship, aciklama: "" };
  const d = DURUM[o.durum] ?? { etiket: o.durum, variant: "neutral" as const, ne: "" };
  const { Icon } = meta;
  const usd = n(o.toplam_usd);
  const minUsd = n(o.min_tutar_usd);
  const acik = n(o.nakit_acigi_try);

  return (
    <div className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-2)] p-4">
      <div className="mb-3 flex items-center gap-2">
        <Icon size={15} className="shrink-0 text-[var(--text-secondary)]" />
        <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">{meta.ad}</h3>
        <Badge variant={d.variant} className="ml-auto">
          {d.etiket}
        </Badge>
      </div>

      <p className="mb-3 text-[11px] leading-snug text-[var(--text-muted)]">{meta.aciklama}</p>

      <div className="mb-3 grid grid-cols-2 gap-2">
        <div className="rounded-md border border-[var(--border-subtle)] px-3 py-2">
          <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">Sipariş tutarı</p>
          <p className="mt-1 text-[18px] font-semibold tabular-nums text-[var(--text-primary)]">
            {fmtUsd(usd)}
          </p>
          <p className="text-[10px] text-[var(--text-muted)]">{fmtTry(n(o.toplam_try))}</p>
        </div>
        <div className="rounded-md border border-[var(--border-subtle)] px-3 py-2">
          <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">
            Tavsiye edilen sipariş tarihi
          </p>
          {o.tavsiye_siparis_tarihi ? (
            <>
              <p className="mt-1 text-[18px] font-semibold tabular-nums text-[var(--text-primary)]">
                {fmtDate(o.tavsiye_siparis_tarihi)}
              </p>
              <p className="text-[10px] text-[var(--text-muted)]">
                {relDays(o.tavsiye_siparis_tarihi)} · raf {fmtDate(o.tahmini_varis)}
              </p>
            </>
          ) : (
            <>
              <p className="mt-1 text-[15px] font-semibold text-[var(--danger)]">Tarih verilemez</p>
              <p className="text-[10px] leading-snug text-[var(--text-muted)]">
                Nakit projeksiyonu {fmtDate(o.projeksiyon_sonu)} tarihine kadar bu tutara ulaşmıyor.
              </p>
            </>
          )}
        </div>
      </div>

      <div className="mb-3">
        <Satir etiket="Satır / adet" deger={`${fmtNum(o.satir)} kalem · ${fmtNum(o.toplam_adet)} adet`} />
        <Satir etiket={`Termin (${o.mod === "HAVA" ? "hava" : "deniz"})`} deger={`${o.termin_gun} gün`} />
        <Satir
          etiket={`Minimum ithalat tutarı (${fmtUsd(minUsd)})`}
          deger={o.esik_karsilandi ? `Sağlandı · ${fmtUsd(usd - minUsd)} üzerinde` : `Eksik ${fmtUsd(n(o.esige_kalan_usd))}`}
          ton={o.esik_karsilandi ? "ok" : "warn"}
        />
        <Satir
          etiket="Nakit kapısı"
          deger={
            acik > 0
              ? `Açık ${fmtTry(acik)}`
              : o.nakit_kapisi_tarihi
                ? `Açık · ${fmtDate(o.nakit_kapisi_tarihi)}`
                : "Açık"
          }
          ton={acik > 0 ? "danger" : "ok"}
        />
        <Satir
          etiket="Stok açısından en geç tarih"
          deger={`${fmtDate(o.en_erken_son_siparis)} · ${relDays(o.en_erken_son_siparis)}`}
          ton={o.gecikmis_satir > 0 ? "danger" : undefined}
        />
        <Satir
          etiket="Beklemenin aylık bedeli"
          deger={fmtTry(n(o.aylik_risk_kar_try))}
          ton={n(o.aylik_risk_kar_try) > 0 ? "warn" : undefined}
        />
      </div>

      <p className="text-[11px] leading-snug text-[var(--text-muted)]">{d.ne}</p>
    </div>
  );
}

function ModTablosu({
  mod,
  satirlar,
  sorular,
  kararlar,
}: {
  mod: string;
  satirlar: OneriSatiri[];
  sorular: Map<string, PanelSorusu[]>;
  kararlar: Map<string, PanelKarari>;
}) {
  const meta = MOD_META[mod] ?? { ad: mod, Icon: Ship, aciklama: "" };
  const { Icon } = meta;
  return (
    <div className="mt-6">
      <h3 className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-[var(--text-primary)]">
        <Icon size={14} className="text-[var(--text-secondary)]" />
        {meta.ad} — {satirlar.length} kalem
      </h3>
      <CfoTable
        empty={satirlar.length === 0 ? "Bu modda bekleyen kalem yok." : undefined}
        head={
          <tr>
            <Th>#</Th>
            <Th>Ürün</Th>
            <Th right>Adet</Th>
            <Th right>Birim</Th>
            <Th right>Tutar</Th>
            <Th right>Aylık satış</Th>
            <Th right>Stok</Th>
            <Th right>Tükeniş</Th>
            <Th right>En geç sipariş</Th>
            <Th right>Kapsam</Th>
            <Th right>Risk ₺/ay</Th>
            <Th right>Bilgi</Th>
          </tr>
        }
      >
        {satirlar.map((s) => (
          <QaRow
            key={`${s.mod}-${s.sku}`}
            colSpan={11}
            scope="ITHALAT_SATIRI"
            entityKey={`${s.mod}|${s.sku}`}
            sku={s.sku}
            urunAdi={s.product_name ?? s.sku}
            sorular={sorular.get(`${s.mod}|${s.sku}`) ?? []}
            karar={kararlar.get(s.sku) ?? null}
            vurgu={s.haric}
          >
            <Td muted>{s.sira}</Td>
            <Td>
              <p className="font-medium text-[var(--text-primary)]">{s.product_name ?? "—"}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-1 font-mono text-[11px] text-[var(--text-muted)]">
                {s.sku}
                {s.kopru && (
                  <Badge variant="info" className="font-sans">
                    hava köprüsü
                  </Badge>
                )}
                {s.maliyet_eksik && (
                  <Badge variant="warn" className="font-sans">
                    maliyet yok
                  </Badge>
                )}
                {s.min_adet_uygulandi && (
                  <Badge variant="neutral" className="font-sans">
                    min adet
                  </Badge>
                )}
                {s.yolda_adet > 0 && (
                  <Badge variant={s.yolda_yeterli ? "ok" : "info"} className="font-sans">
                    yolda {fmtNum(s.yolda_adet)} adet
                    {s.yolda_eta ? ` · ${fmtDate(s.yolda_eta)}` : ""}
                  </Badge>
                )}
              </p>
            </Td>
            <Td right strong>{fmtNum(s.onerilen_adet)}</Td>
            <Td right muted>{s.maliyet_eksik ? "—" : fmtUsd(n(s.birim_maliyet_usd))}</Td>
            <Td right strong>{s.maliyet_eksik ? "—" : fmtUsd(n(s.tutar_usd))}</Td>
            <Td right muted>{fmtNum(n(s.aylik_satis))}</Td>
            <Td right danger={(s.stok ?? 0) === 0}>{fmtNum(s.stok ?? 0)}</Td>
            <Td right muted>{fmtDate(s.tukenis_tarihi)}</Td>
            <Td right danger={s.gecikti}>
              {fmtDate(s.son_siparis_tarihi)}
              <span className="block text-[10px] opacity-70">{relDays(s.son_siparis_tarihi)}</span>
            </Td>
            <Td right muted>{s.kapsam_ay == null ? "—" : `${n(s.kapsam_ay).toFixed(1)} ay`}</Td>
            <Td right>{fmtTry(n(s.aylik_risk_kar_try))}</Td>
          </QaRow>
        ))}
      </CfoTable>
    </div>
  );
}

export function ImportOrderSection({
  ozet,
  satirlar,
  hedef,
  yoldaki,
  sorular,
  kararlar,
}: {
  ozet: OneriOzeti[];
  satirlar: OneriSatiri[];
  hedef: CiroHedefi | null;
  /** Yoldaki partiler ve içeriklerinin kapsama oranı. */
  yoldaki: YoldakiKapsam[];
  /** entity_key ("MOD|SKU") → o satırın soruları. */
  sorular: Map<string, PanelSorusu[]>;
  /** SKU → kalıcı ürün kararı. */
  kararlar: Map<string, PanelKarari>;
}) {
  const hava = ozet.find((o) => o.mod === "HAVA");
  const deniz = ozet.find((o) => o.mod === "DENIZ");
  const havaSatir = satirlar.filter((s) => s.mod === "HAVA");
  const denizSatir = satirlar.filter((s) => s.mod === "DENIZ");

  const toplamUsd = ozet.reduce((a, o) => a + n(o.toplam_usd), 0);
  const korunanCiroUsd = ozet.reduce((a, o) => a + n(o.aylik_ciro_usd), 0);
  const riskKar = ozet.reduce((a, o) => a + n(o.aylik_risk_kar_try), 0);
  const gecikmis = ozet.reduce((a, o) => a + o.gecikmis_satir, 0);
  const maliyetEksik = ozet.reduce((a, o) => a + o.maliyet_eksik_satir, 0);
  // Hava köprüsü satırları iki listede birden görünür; benzersiz SKU sayısı için tekilleştirilir.
  const kopruSku = new Set(satirlar.filter((s) => s.kopru).map((s) => s.sku));
  const haricSatirlar = satirlar.filter((s) => s.haric);
  const yoldaSatirlar = satirlar.filter((s) => s.yolda_yeterli);
  // İçeriği girilmemiş, riskli olmayan, yolda duran partiler: bunların malı
  // öneriden düşülemiyor demektir.
  const eksikYoldaki = yoldaki.filter(
    (y) => y.risk !== "RISKLI" && (y.beklenen_kalem ?? 0) > y.girilen_kalem,
  );
  const icerigiYokYoldaki = yoldaki.filter(
    (y) => y.risk !== "RISKLI" && y.beklenen_kalem == null && y.girilen_kalem === 0,
  );
  const cevapsizSoru = [...sorular.values()].flat().filter((q) => !q.cevap).length;
  const minAdet = ozet[0]?.min_adet_kural ?? 5;
  const enKucukAdet = satirlar.length > 0 ? Math.min(...satirlar.map((s) => s.onerilen_adet)) : 0;

  // Hedef ayarlardan gelir; henüz tam ay yoksa (hedef null) varsayılan gösterilir.
  const hedefUsd = hedef ? n(hedef.hedef_usd) : 100_000;
  const ciroUsd = n(hedef?.ciro_usd);
  const gerekenKat = n(hedef?.gereken_kat);
  // Bu siparişler ciroyu BÜYÜTMEZ, mevcut ciroyu korur. Hedefle ilişkisi bu yüzden
  // "hedefin yüzde kaçını savunuyor" olarak yazılıyor — "hedefe katkı" değil.
  const korunanPay = hedefUsd > 0 ? (korunanCiroUsd / hedefUsd) * 100 : 0;

  if (ozet.length === 0) {
    return (
      <Card className="mb-6 p-5">
        <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
          <Ship size={15} /> İthalat sipariş önerisi
        </h2>
        <p className="text-[12px] text-[var(--text-muted)]">
          Açık partide bekleyen kalem yok. Kalemler <code>cfo_order_line</code> tablosuna
          düştüğünde bu bölüm dolar.
        </p>
      </Card>
    );
  }

  return (
    <Card className="mb-6 p-5">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
        <Ship size={15} /> İthalat sipariş önerisi — sıradaki parti
      </h2>
      <p className="mb-4 text-[11px] leading-snug text-[var(--text-muted)]">
        Sıradaki sipariş kararı artık yalnız burada. Kaynak, CFO&apos;nun parti defteri
        (<code>cfo_order_line</code>) — sayfa kendi başına ürün seçmez, verilmiş kararları
        gösterir. Hava ve deniz ayrı partidir: terminleri farklı olduğu için sipariş
        tarihleri de farklıdır.
      </p>

      {/* ── Ciro hedefi ─────────────────────────────────────────────── */}
      {hedef && (
        <div className="mb-4 rounded-lg border border-[var(--border-default)] bg-[var(--surface-2)] p-4">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-[var(--text-muted)]">
              <Target size={13} /> Aylık ciro hedefi
            </span>
            <span className="text-[18px] font-semibold tabular-nums text-[var(--text-primary)]">
              {fmtUsd(ciroUsd)}
            </span>
            <span className="text-[12px] text-[var(--text-muted)]">
              / {fmtUsd(hedefUsd)} hedef — %{n(hedef.hedef_pct).toFixed(1)} ({hedef.ay})
            </span>
            <span className="ml-auto text-[12px] tabular-nums text-[var(--warn)]">
              açık {fmtUsd(n(hedef.acik_usd))} · {gerekenKat.toFixed(2)}× gerekiyor
            </span>
          </div>
          <p className="mt-2 text-[11px] leading-snug text-[var(--text-muted)]">
            Bu iki parti hedefe <strong>yaklaştırmaz</strong>; mevcut cironun{" "}
            {fmtUsd(korunanCiroUsd)}/ay&apos;lık kısmını (hedefin %{korunanPay.toFixed(0)}
            &apos;i) stoksuz kalmaktan korur. {gerekenKat.toFixed(2)}× büyüme, adetleri
            artırmakla değil yeni ürün veya yeni kanalla gelir — ve adetler bugünkü hıza
            göre seçildiği için hedef hızda kapsam süreleri {gerekenKat.toFixed(2)}× kısalır.
          </p>
        </div>
      )}

      {/* ── Hava / Deniz kartları ───────────────────────────────────── */}
      <div className="grid gap-3 lg:grid-cols-2">
        {hava && <ModKarti o={hava} />}
        {deniz && <ModKarti o={deniz} />}
      </div>

      {/* ── Uyarılar ────────────────────────────────────────────────── */}
      <div className="mt-4 space-y-2">
        {ozet.every((o) => o.durum === "KAPI_KAPALI") && (
          <Uyari ton="danger">
            Her iki parti de nakit kapısına takılıyor. Toplam {fmtUsd(toplamUsd)} sipariş için
            bugünkü nakit {fmtTry(n(ozet[0].bugunku_nakit_try))}; projeksiyonun{" "}
            {fmtDate(ozet[0].projeksiyon_sonu)} tarihine kadarki en yüksek gün sonu bakiyesi{" "}
            {fmtTry(n(ozet[0].projeksiyon_en_yuksek_nakit))}. 30.08 kuralı gereği KMH ve kart
            limiti bu hesaba girmez, dolayısıyla sipariş verilemez. Kapıyı açacak tek şey
            tahsilatların büyümesi veya çıkışların ertelenmesi — kredi kullanılacaksa bu bir
            kural değişikliğidir, tabloda kendiliğinden çözülmez.
          </Uyari>
        )}

        {gecikmis > 0 && (
          <Uyari ton="danger">
            {gecikmis} kalemde en geç sipariş tarihi geçti. Bugün sipariş verilse bile bu
            ürünler termin süresince stoksuz kalacak; beklemenin bedeli ayda{" "}
            {fmtTry(riskKar)} brüt kâr.
          </Uyari>
        )}

        {kopruSku.size > 0 && (
          <Uyari ton="warn">
            {kopruSku.size} SKU hem hava hem deniz listesinde. Bu mükerrer kayıt değil, kasıtlı
            hava köprüsüdür: hava partisi stoku şimdi yetiştirir, deniz partisi asıl stoku
            getirir. İkisi de verilecekse adetler toplanır — tek sipariş sanıp birini iptal
            etmeyin.
          </Uyari>
        )}

        {eksikYoldaki.map((y) => (
          <Uyari ton="danger" key={y.kod}>
            <strong>{y.kod}</strong> partisi
            {y.eta ? ` ${fmtDate(y.eta)} tarihinde` : " yolda ve"} geliyor —{" "}
            {fmtNum(y.beklenen_kalem ?? 0)} kalem, {fmtNum(y.beklenen_adet ?? 0)} adet. Ama
            içeriğinin yalnız <strong>{fmtNum(y.girilen_kalem)} kalemi</strong> sisteme
            girilmiş (%{n(y.kapsam_pct).toFixed(0)}). Yani aşağıdaki öneriler bu malı{" "}
            <strong>yok sayıyor</strong>: rafa girecek bir ürün yeniden sipariş listesinde
            duruyor olabilir. Faturayı (kalem · adet · SKU) girmeden bu parti için
            &quot;alalım mı&quot; sorusu güvenilir cevaplanamaz.
          </Uyari>
        ))}

        {icerigiYokYoldaki.map((y) => (
          <Uyari ton="warn" key={y.kod}>
            <strong>{y.kod}</strong> partisi yolda ama ne kaç kalem olduğu ne de içeriği
            biliniyor. Öneriler bu partiyi de yok sayıyor.
          </Uyari>
        ))}

        {yoldaSatirlar.length > 0 && (
          <Uyari ton="info">
            {yoldaSatirlar.length} kalem zaten yolda ve tükenişten önce rafa gireceği için
            öneriden çıkarıldı; tutara girmiyorlar. Tabloda &quot;yolda&quot; rozetiyle
            duruyorlar.
          </Uyari>
        )}

        {haricSatirlar.length > 0 && (
          <Uyari ton="info">
            {haricSatirlar.length} kalem sizin &quot;alma&quot; kararınızla öneriden çıkarıldı ve
            tutara girmiyor. Tabloda soluk duruyorlar — gizlenmiyorlar, çünkü minimum ithalat
            eşiği bu kalemler olmadan hesaplanıyor ve bunu görmeden eşiği okumak yanıltıcı olur.
            Kararı satırın sonundaki alandan kaldırabilirsiniz.
          </Uyari>
        )}

        {cevapsizSoru > 0 && (
          <Uyari ton="warn">
            {cevapsizSoru} satırda cevabını bilmediğim soru var (satır sonundaki
            &quot;soru&quot; rozeti). Bunlar cevaplanınca tutarlar ve öneriler doğrulanır —
            özellikle birim maliyeti olmayan kalemler parti toplamına hiç girmiyor.
          </Uyari>
        )}

        {maliyetEksik > 0 && (
          <Uyari ton="warn">
            {maliyetEksik} kalemin birim maliyeti girilmemiş; o satırlar tutara dâhil değil.
            Yani gerçek parti tutarı gösterilenden YÜKSEK. Minimum ithalat tutarı kararı bu
            eksik toplam üzerinden veriliyor.
          </Uyari>
        )}

        {satirlar.every((s) => !s.min_adet_uygulandi) && (
          <Uyari ton="info">
            Minimum sipariş adedi kuralı (satır başına {minAdet} adet) şu an hiçbir satırı
            değiştirmiyor — en küçük kalem {fmtNum(enKucukAdet)} adetle zaten bu eşiğin
            üzerinde. Kural yürürlükte, sadece bağlayıcı değil.
          </Uyari>
        )}
      </div>

      {/* ── Kalem tabloları ─────────────────────────────────────────── */}
      <ModTablosu mod="HAVA" satirlar={havaSatir} sorular={sorular} kararlar={kararlar} />
      <ModTablosu mod="DENIZ" satirlar={denizSatir} sorular={sorular} kararlar={kararlar} />

      <p className="mt-4 text-[11px] leading-relaxed text-[var(--text-muted)]">
        Kurallar <code>cfo_settings</code> içinde: hava termini {hava?.termin_gun ?? 22} gün,
        deniz termini {deniz?.termin_gun ?? 67} gün, minimum ithalat tutarı{" "}
        {fmtUsd(n(ozet[0].min_tutar_usd))}, minimum satır adedi {minAdet}, hedef aylık ciro{" "}
        {fmtUsd(hedefUsd)}. Terminler 28.08 partisinde ölçülen sürelerdir; tedarikçi veya
        acente değişirse ayarlardan güncellenmelidir.{" "}
        <Link href="/cfo/odemeler" className="text-[var(--accent)] hover:underline">
          Nakit kapısının günü gününe hâli <ArrowRight size={11} className="inline" />
        </Link>
      </p>
    </Card>
  );
}
