"use client";

/**
 * Ürün adayı düzenleyici.
 *
 * Üç bölüm bilinçli olarak ayrı: BİLGİ (ilan alanları), GÖRSEL (tür zorunlu),
 * ÜRETİM (ChatGPT promptu + Excel'e hazır görsel linkleri).
 *
 * Görsel türü seçimi yüklemeden ÖNCE yapılıyor ve varsayılanı yok. Sebep:
 * Çince bilgi görselinin ilana karışması geri dönüşü pahalı bir hata —
 * pazaryeri ilanı reddediyor veya daha kötüsü yayınlanıp müşteri görüyor.
 * Varsayılan "URUN" koysaydık, hızlı yükleme yapan biri hepsini ürün görseli
 * olarak işaretlerdi.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Upload, Trash2, Copy, Check, Loader2, Ban, CircleCheck, TriangleAlert,
  ChevronUp, ChevronDown, Star,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  saveCandidateAction,
  uploadCandidateImageAction,
  setImageKindAction,
  deleteCandidateImageAction,
  setCandidateStatusAction,
  moveCandidateImageAction,
  setMainImageAction,
} from "@/lib/actions/urun-aday-actions";
import { PUAN_ESIGI, BASLIK_MIN, BASLIK_TRENDYOL } from "@/lib/urun-aday/sabitler";
import { gorseliKucult, boyutYaz } from "@/lib/urun-aday/gorsel-kucult";

export type Gorsel = {
  id: number;
  url: string;
  tur: string;
  sira: number;
  dosya_adi: string | null;
};

export type Aday = {
  id: string;
  sku: string;
  fatura_sku: string | null;
  kaynak: string | null;
  invoice_ad: string | null;
  ad_tr: string | null;
  marka: string | null;
  kategori: string | null;
  aciklama: string | null;
  aciklama_1688: string | null;
  barkod: string | null;
  mensei: string | null;
  garanti_ay: number | null;
  adet: number | null;
  alis_rmb: unknown;
  birim_usd: unknown;
  gumruklu_usd: unknown;
  agirlik_kg: unknown;
  kutu_en_cm: unknown;
  kutu_boy_cm: unknown;
  kutu_yuk_cm: unknown;
  satis_try: unknown;
  kargo_try: unknown;
  link_1688: string | null;
  note: string | null;
  durum: string;
  red_sebep: string | null;
  puan: number;
  eksikler: string[] | null;
};

const TUR_ETIKET: Record<string, { ad: string; aciklama: string; v: "ok" | "warn" | "danger" | "info" | "neutral" }> = {
  URUN: { ad: "Ürün fotoğrafı", aciklama: "İlanda kullanılır", v: "ok" },
  PAKET: { ad: "Kutu / ambalaj", aciklama: "İlanda kullanılır", v: "info" },
  INFO_TR: { ad: "Türkçe bilgi görseli", aciklama: "İlanda kullanılır", v: "ok" },
  CINCE_BILGI: { ad: "Çince bilgi görseli", aciklama: "İLANA GİRMEZ — referans", v: "danger" },
};

const inputCls =
  "w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-1)] px-2.5 py-1.5 " +
  "text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] " +
  "focus:border-[var(--accent-border)] focus:outline-none";
const btnCls =
  "inline-flex shrink-0 items-center gap-1.5 rounded-md border border-[var(--border-default)] " +
  "px-3 py-1.5 text-[12px] text-[var(--text-secondary)] transition " +
  "hover:border-[var(--accent-border)] hover:text-[var(--accent)] disabled:opacity-50";

function Alan({
  etiket,
  ipucu,
  sayac,
  children,
}: {
  etiket: string;
  ipucu?: string;
  sayac?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-medium text-[var(--text-secondary)]">{etiket}</span>
        {sayac}
      </span>
      {children}
      {ipucu && <span className="mt-0.5 block text-[10px] leading-snug text-[var(--text-muted)]">{ipucu}</span>}
    </label>
  );
}

/**
 * Başlık karakter sayacı.
 *
 * Trendyol 100'de kesiyor — en dar sınır o, o yüzden ölçüt odur. Sayaç
 * yazarken canlı güncellensin ki kısaltırken kaç karakter atman gerektiğini
 * kaydetmeden göresin: 100'ü aşınca kaç fazla olduğunu da yazıyor.
 */
function BaslikSayaci({ uzunluk }: { uzunluk: number }) {
  const asan = uzunluk - BASLIK_TRENDYOL;
  const renk =
    asan > 0
      ? "text-[var(--danger)]"
      : uzunluk < BASLIK_MIN
        ? "text-[var(--warn)]"
        : uzunluk > BASLIK_TRENDYOL - 10
          ? "text-[var(--warn)]"
          : "text-[var(--text-muted)]";
  return (
    <span className={`text-[11px] font-medium tabular-nums ${renk}`}>
      {uzunluk}/{BASLIK_TRENDYOL}
      {asan > 0 && <span className="ml-1 font-normal">· {asan} fazla</span>}
      {uzunluk > 0 && uzunluk < BASLIK_MIN && (
        <span className="ml-1 font-normal">· en az {BASLIK_MIN}</span>
      )}
    </span>
  );
}

function KopyalaBtn({ metin, etiket = "Kopyala" }: { metin: string; etiket?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      className={btnCls}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(metin);
          setOk(true);
          setTimeout(() => setOk(false), 1800);
        } catch {
          setOk(false);
        }
      }}
    >
      {ok ? <Check size={12} /> : <Copy size={12} />}
      {ok ? "Kopyalandı" : etiket}
    </button>
  );
}

export function AdayEditor({
  aday,
  gorseller,
  ozellikPrompt,
  kutuPrompt,
  promptEksik,
}: {
  aday: Aday;
  gorseller: Gorsel[];
  ozellikPrompt: string | null;
  kutuPrompt: string | null;
  promptEksik: string[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [mesaj, setMesaj] = useState<string | null>(null);
  const [tur, setTur] = useState<string>("");
  const [redSebep, setRedSebep] = useState("");

  const s = (v: unknown) => (v == null ? "" : String(v));
  const [form, setForm] = useState<Record<string, string>>({
    sku: s(aday.sku),
    ad_tr: s(aday.ad_tr),
    marka: s(aday.marka),
    kategori: s(aday.kategori),
    aciklama: s(aday.aciklama),
    aciklama_1688: s(aday.aciklama_1688),
    barkod: s(aday.barkod),
    mensei: s(aday.mensei),
    garanti_ay: s(aday.garanti_ay),
    kutu_en_cm: s(aday.kutu_en_cm),
    kutu_boy_cm: s(aday.kutu_boy_cm),
    kutu_yuk_cm: s(aday.kutu_yuk_cm),
    satis_try: s(aday.satis_try),
    link_1688: s(aday.link_1688),
    note: s(aday.note),
  });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  function kaydet() {
    start(async () => {
      const r = await saveCandidateAction(aday.id, aday.sku, form);
      setMesaj(r.message ?? null);
      if (!r.ok) return;
      // Sayfa adresi sku'ya bağlı; değiştiyse eski adres 404 olur.
      if (r.yeniSku && r.yeniSku !== aday.sku) {
        router.replace(`/admin/yeni-urunler/${encodeURIComponent(r.yeniSku)}`);
      } else {
        router.refresh();
      }
    });
  }

  function yukle(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!tur) {
      setMesaj("Önce görsel türünü seçin.");
      return;
    }
    start(async () => {
      // Yüklemeden ÖNCE küçült: sunucu eyleminin gövde sınırı 4 MB ve aşan
      // istek sunucuya hiç ulaşmadan 404 dönüyor. Ayrıca pazaryerleri zaten
      // 2000 pikselden fazlasını kullanmıyor.
      setMesaj("Görsel hazırlanıyor…");
      const k = await gorseliKucult(file);

      const fd = new FormData();
      fd.append("file", k.dosya);
      fd.append("tur", tur);

      const r = await uploadCandidateImageAction(aday.id, aday.sku, fd);
      const bilgi = k.kucultuldu
        ? ` (${boyutYaz(k.eskiBayt)} → ${boyutYaz(k.yeniBayt)}${k.not ? `, ${k.not}` : ""})`
        : "";
      setMesaj((r.message ?? "") + (r.ok ? bilgi : ""));
      if (r.ok) router.refresh();
    });
  }

  function turDegistir(id: number, yeni: string) {
    start(async () => {
      const r = await setImageKindAction(id, aday.sku, yeni);
      setMesaj(r.message ?? null);
      if (r.ok) router.refresh();
    });
  }

  function tasi(id: number, yon: "yukari" | "asagi") {
    start(async () => {
      const r = await moveCandidateImageAction(aday.id, aday.sku, id, yon);
      setMesaj(r.message ?? null);
      if (r.ok) router.refresh();
    });
  }

  function anaYap(id: number) {
    start(async () => {
      const r = await setMainImageAction(aday.id, aday.sku, id);
      setMesaj(r.message ?? null);
      if (r.ok) router.refresh();
    });
  }

  function gorselSil(id: number) {
    start(async () => {
      const r = await deleteCandidateImageAction(id, aday.sku);
      setMesaj(r.message ?? null);
      if (r.ok) router.refresh();
    });
  }

  function durumDegistir(d: "TASLAK" | "HAZIR" | "LISTELENDI" | "REDDEDILDI") {
    start(async () => {
      const r = await setCandidateStatusAction(aday.id, aday.sku, d, redSebep);
      setMesaj(r.message ?? null);
      if (r.ok) router.refresh();
    });
  }

  // Marka yazılıysa başlık onunla başlamalı (Hepsiburada kuralı). Flextail
  // ürünlerinin başlığına yanlışlıkla "Alfas" öneki konmuştu; bu uyarı onu yakalar.
  const markaUyumsuz =
    form.marka.trim().length > 0 &&
    form.ad_tr.trim().length > 0 &&
    !form.ad_tr.trim().toLocaleLowerCase("tr").startsWith(form.marka.trim().toLocaleLowerCase("tr"));

  // Excel şablonlarına giren görseller: Çince bilgi görseli BURADA YOK.
  // Sıra sunucudan geliyor (tek `sira` sütunu) — burada yeniden sıralamıyoruz ki
  // ekranda gördüğün sıra ile Excel'e giden sıra aynı olsun.
  const ilanGorselleri = gorseller.filter((g) => g.tur !== "CINCE_BILGI");
  const anaGorselId = ilanGorselleri[0]?.id ?? null;
  const linkBloku = ilanGorselleri.map((g) => g.url).join("\n");
  const cinceSayi = gorseller.filter((g) => g.tur === "CINCE_BILGI").length;

  return (
    <div className="space-y-4">
      {mesaj && (
        <p className="rounded-md border border-[var(--border-default)] bg-[var(--surface-2)] px-3 py-2 text-[12px] text-[var(--text-secondary)]">
          {mesaj}
        </p>
      )}

      {/* ── Bilgi ───────────────────────────────────────────────── */}
      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">İlan bilgileri</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Alan
            etiket="SKU"
            ipucu={
              aday.fatura_sku && aday.fatura_sku !== form.sku
                ? `Faturadaki kod: ${aday.fatura_sku} — parti bağı o koddan kuruluyor, bozulmaz.`
                : "Faturadan geldi. Kendi katalog kodunuzla değiştirebilirsiniz."
            }
          >
            <input
              className={`${inputCls} font-mono`}
              value={form.sku}
              onChange={(e) => set("sku", e.target.value)}
            />
          </Alan>
          <Alan etiket="Barkod / GTIN" ipucu="Puanlamaya girmiyor — girilirse saklanır.">
            <input className={inputCls} value={form.barkod} onChange={(e) => set("barkod", e.target.value)} />
          </Alan>
          <div className="sm:col-span-2">
            <Alan
              etiket="Türkçe ürün adı"
              ipucu={
                markaUyumsuz
                  ? `Başlık "${form.marka}" ile başlamıyor — Hepsiburada başlığın MARKA ile başlamasını istiyor.`
                  : "Hepsiburada kuralı: MARKA ile başlamalı. Trendyol 100 karakterde kesiyor."
              }
              sayac={<BaslikSayaci uzunluk={form.ad_tr.length} />}
            >
              <input
                className={`${inputCls} ${
                  form.ad_tr.length > BASLIK_TRENDYOL
                    ? "border-[var(--danger-border)]"
                    : markaUyumsuz
                      ? "border-[var(--warn-border)]"
                      : ""
                }`}
                value={form.ad_tr}
                onChange={(e) => set("ad_tr", e.target.value)}
              />
            </Alan>
          </div>
          <Alan etiket="Marka">
            <input className={inputCls} value={form.marka} onChange={(e) => set("marka", e.target.value)} />
          </Alan>
          <Alan etiket="Kategori">
            <input className={inputCls} value={form.kategori} onChange={(e) => set("kategori", e.target.value)} />
          </Alan>
          <Alan etiket="Satış fiyatı (₺)">
            <input className={inputCls} value={form.satis_try} onChange={(e) => set("satis_try", e.target.value)} />
          </Alan>
          <Alan etiket="Menşei">
            <input className={inputCls} value={form.mensei} onChange={(e) => set("mensei", e.target.value)} />
          </Alan>
          <Alan etiket="Garanti (ay)">
            <input className={inputCls} value={form.garanti_ay} onChange={(e) => set("garanti_ay", e.target.value)} />
          </Alan>
          <div className="sm:col-span-2">
            <Alan etiket="Kutu ölçüsü (cm) — en × boy × yükseklik" ipucu="Desi hesabı ve kargo maliyeti buna bağlı.">
              <div className="flex gap-2">
                {(["kutu_en_cm", "kutu_boy_cm", "kutu_yuk_cm"] as const).map((k) => (
                  <input key={k} className={inputCls} value={form[k]} onChange={(e) => set(k, e.target.value)} />
                ))}
              </div>
            </Alan>
          </div>
          <div className="sm:col-span-2">
            <Alan etiket="Pazaryeri açıklaması" ipucu="400 karakterin altı puan getirmiyor; pazaryeri kalite eşiği.">
              <textarea
                className={`${inputCls} min-h-[120px]`}
                value={form.aciklama}
                onChange={(e) => set("aciklama", e.target.value)}
              />
            </Alan>
            <p className="mt-1 text-[10px] text-[var(--text-muted)]">
              {form.aciklama.length} karakter
              {form.aciklama.length < 400 && ` · 400'e ${400 - form.aciklama.length} kaldı`}
            </p>
          </div>
          <div className="sm:col-span-2">
            <Alan
              etiket="1688 ham bilgi (kopyala-yapıştır)"
              ipucu="Çince olabilir. Buraya olduğu gibi yapıştırın — açıklamayı buradan yazacağız, kaynak kaybolmasın."
            >
              <textarea
                className={`${inputCls} min-h-[100px] font-mono text-[11px]`}
                value={form.aciklama_1688}
                onChange={(e) => set("aciklama_1688", e.target.value)}
                placeholder="1688 ürün sayfasındaki özellik tablosunu / açıklamayı buraya yapıştırın…"
              />
            </Alan>
          </div>
          <Alan etiket="1688 linki">
            <input className={inputCls} value={form.link_1688} onChange={(e) => set("link_1688", e.target.value)} />
          </Alan>
          <Alan etiket="Not">
            <input className={inputCls} value={form.note} onChange={(e) => set("note", e.target.value)} />
          </Alan>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button className={btnCls} disabled={pending} onClick={kaydet}>
            {pending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Kaydet
          </button>
          {form.aciklama_1688.trim() && (
            <KopyalaBtn metin={form.aciklama_1688} etiket="1688 metnini kopyala" />
          )}
        </div>
      </Card>

      {/* ── Görseller ───────────────────────────────────────────── */}
      <Card className="p-5">
        <h2 className="mb-1 text-sm font-semibold text-[var(--text-primary)]">Görseller</h2>
        <p className="mb-3 text-[11px] leading-snug text-[var(--text-muted)]">
          Tür seçmeden yükleme yapılamaz. <strong>Çince bilgi görselleri ilana girmez</strong> —
          yüklenebilir ve saklanır (ölçü, montaj şeması çoğu zaman yalnız orada), ama Excel
          çıktısına ve ilana çıkmazlar. Sol üstteki numara ilandaki sırayı gösterir;{" "}
          <strong>1 numara ana görseldir</strong>. Ok tuşlarıyla sırayı değiştirin.
        </p>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <select
            className={`${inputCls} w-auto`}
            value={tur}
            onChange={(e) => setTur(e.target.value)}
          >
            <option value="">— Görsel türü seçin —</option>
            {Object.entries(TUR_ETIKET).map(([k, v]) => (
              <option key={k} value={k}>
                {v.ad} ({v.aciklama})
              </option>
            ))}
          </select>

          <label className={`${btnCls} cursor-pointer ${!tur ? "opacity-50" : ""}`}>
            <Upload size={12} /> Görsel yükle
            <input
              type="file"
              className="sr-only"
              accept="image/jpeg,image/png,image/webp,image/gif"
              disabled={!tur || pending}
              onChange={yukle}
            />
          </label>
          <span className="text-[11px] text-[var(--text-muted)]">
            JPEG/PNG/WebP/GIF · büyük görseller otomatik 2000 piksele küçültülür
          </span>
        </div>

        {gorseller.length === 0 ? (
          <p className="text-[12px] text-[var(--text-muted)]">Henüz görsel yok.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {gorseller.map((g) => {
              const meta = TUR_ETIKET[g.tur] ?? { ad: g.tur, aciklama: "", v: "neutral" as const };
              const cince = g.tur === "CINCE_BILGI";
              const ana = g.id === anaGorselId;
              // İlan sırası: Çince olanlar bu numaralandırmaya girmez.
              const ilanSira = cince ? null : ilanGorselleri.findIndex((x) => x.id === g.id) + 1;
              return (
                <div
                  key={g.id}
                  className={`overflow-hidden rounded-lg border ${
                    ana
                      ? "border-[var(--accent-border)] ring-1 ring-[var(--accent-border)]"
                      : cince
                        ? "border-[var(--danger-border)]"
                        : "border-[var(--border-default)]"
                  }`}
                >
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={g.url}
                      alt={g.dosya_adi ?? ""}
                      className={`h-32 w-full bg-[var(--surface-1)] object-contain ${cince ? "opacity-70" : ""}`}
                    />
                    {ilanSira != null && (
                      <span className="absolute left-1.5 top-1.5 rounded bg-[var(--surface-3)] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-[var(--text-primary)]">
                        {ilanSira}
                      </span>
                    )}
                    {ana && (
                      <span className="absolute right-1.5 top-1.5 inline-flex items-center gap-1 rounded bg-[var(--accent)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--accent-fg)]">
                        <Star size={9} /> Ana
                      </span>
                    )}
                  </div>

                  <div className="space-y-1.5 p-2">
                    <Badge variant={meta.v}>{meta.ad}</Badge>
                    {cince && (
                      <p className="text-[10px] leading-snug text-[var(--danger)]">İlana girmez</p>
                    )}

                    {/* Sıralama: yukarı = ilanda öne, aşağı = geriye */}
                    <div className="flex items-center gap-1">
                      <button
                        className={`${btnCls} px-2`}
                        disabled={pending}
                        onClick={() => tasi(g.id, "yukari")}
                        title="Sırada öne al"
                      >
                        <ChevronUp size={12} />
                      </button>
                      <button
                        className={`${btnCls} px-2`}
                        disabled={pending}
                        onClick={() => tasi(g.id, "asagi")}
                        title="Sırada geriye al"
                      >
                        <ChevronDown size={12} />
                      </button>
                      {!cince && !ana && (
                        <button
                          className={`${btnCls} px-2`}
                          disabled={pending}
                          onClick={() => anaYap(g.id)}
                          title="Ana görsel yap (sıranın başına al)"
                        >
                          <Star size={12} /> Ana yap
                        </button>
                      )}
                    </div>

                    <select
                      className={`${inputCls} py-1 text-[11px]`}
                      value={g.tur}
                      disabled={pending}
                      onChange={(e) => turDegistir(g.id, e.target.value)}
                    >
                      {Object.entries(TUR_ETIKET).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v.ad}
                        </option>
                      ))}
                    </select>
                    <div className="flex items-center gap-1">
                      <KopyalaBtn metin={g.url} etiket="Link" />
                      <button
                        className={`${btnCls} px-2`}
                        disabled={pending}
                        onClick={() => gorselSil(g.id)}
                        title="Kaydı kaldır"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* ── Üretim ──────────────────────────────────────────────── */}
      <Card className="p-5">
        <h2 className="mb-1 text-sm font-semibold text-[var(--text-primary)]">
          ChatGPT bilgi görseli promptu
        </h2>
        <p className="mb-3 text-[11px] leading-snug text-[var(--text-muted)]">
          Çince bilgi görselinin Türkçe karşılığını üretmek için. Prompt yalnız GİRİLMİŞ
          bilgilerden kurulur — eksik alanı prompta koymuyoruz, çünkü model boş bıraktığın
          ölçüyü uyduruyor.
        </p>

        {promptEksik.length > 0 ? (
          <p className="flex items-start gap-2 rounded-md border border-[var(--warn-border)] bg-[var(--warn-dim)] px-3 py-2 text-[11px] leading-snug text-[var(--warn)]">
            <TriangleAlert size={13} className="mt-px shrink-0" />
            <span>
              Prompt üretilemiyor. Önce şunlar gerekli: {promptEksik.join(", ")}. Yetersiz bilgiyle
              prompt vermek, modele ölçü ve özellik uydurtur.
            </span>
          </p>
        ) : (
          <div className="space-y-3">
            {ozellikPrompt && (
              <div className="rounded-md border border-[var(--border-subtle)] p-3">
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-[12px] font-medium text-[var(--text-primary)]">
                    1) Teknik özellikler kartı
                  </span>
                  <span className="ml-auto">
                    <KopyalaBtn metin={ozellikPrompt} etiket="Promptu kopyala" />
                  </span>
                </div>
                <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded bg-[var(--surface-1)] p-2 font-mono text-[10px] leading-snug text-[var(--text-secondary)]">
                  {ozellikPrompt}
                </pre>
              </div>
            )}
            {kutuPrompt && (
              <div className="rounded-md border border-[var(--border-subtle)] p-3">
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-[12px] font-medium text-[var(--text-primary)]">
                    2) Kutuda ne var kartı
                  </span>
                  <span className="ml-auto">
                    <KopyalaBtn metin={kutuPrompt} etiket="Promptu kopyala" />
                  </span>
                </div>
                <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded bg-[var(--surface-1)] p-2 font-mono text-[10px] leading-snug text-[var(--text-secondary)]">
                  {kutuPrompt}
                </pre>
              </div>
            )}
            <p className="text-[11px] leading-snug text-[var(--text-muted)]">
              Üretilen görseli yukarıdan <strong>Türkçe bilgi görseli</strong> türüyle yükleyin;
              o zaman Excel çıktısına girer.
            </p>
          </div>
        )}
      </Card>

      {/* ── Excel'e hazır linkler ───────────────────────────────── */}
      <Card className="p-5">
        <h2 className="mb-1 text-sm font-semibold text-[var(--text-primary)]">
          Excel şablonu için görsel linkleri
        </h2>
        <p className="mb-3 text-[11px] leading-snug text-[var(--text-muted)]">
          Sırayla Görsel 1, 2, 3… sütunlarına gider. Ürün fotoğrafları önce, sonra kutu ve
          Türkçe bilgi görselleri.
          {cinceSayi > 0 && (
            <>
              {" "}
              <strong className="text-[var(--danger)]">
                {cinceSayi} Çince görsel bu listeye alınmadı.
              </strong>
            </>
          )}
        </p>
        {ilanGorselleri.length === 0 ? (
          <p className="text-[12px] text-[var(--text-muted)]">
            İlana girecek görsel yok. En az bir ürün fotoğrafı gerekli.
          </p>
        ) : (
          <>
            <pre className="mb-2 max-h-40 overflow-auto rounded bg-[var(--surface-1)] p-2 font-mono text-[10px] leading-relaxed text-[var(--text-secondary)]">
              {linkBloku}
            </pre>
            <KopyalaBtn metin={linkBloku} etiket={`${ilanGorselleri.length} linki kopyala`} />
          </>
        )}
      </Card>

      {/* ── Karar ───────────────────────────────────────────────── */}
      <Card className="p-5">
        <h2 className="mb-1 text-sm font-semibold text-[var(--text-primary)]">İlan kararı</h2>
        <p className="mb-3 text-[11px] leading-snug text-[var(--text-muted)]">
          {aday.puan >= PUAN_ESIGI
            ? `Puan ${aday.puan}/100 — eşik sağlandı, ilan açılabilir.`
            : `Puan ${aday.puan}/100. ${PUAN_ESIGI} altında ilan açılamaz; eksikler: ${(aday.eksikler ?? []).join(", ")}`}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            className={`${btnCls} ${aday.puan >= PUAN_ESIGI ? "border-[var(--ok-border)] text-[var(--ok)]" : ""}`}
            disabled={pending || aday.puan < PUAN_ESIGI}
            onClick={() => durumDegistir("HAZIR")}
            title={aday.puan < PUAN_ESIGI ? `Puan ${aday.puan} — ${PUAN_ESIGI} gerekiyor` : ""}
          >
            <CircleCheck size={12} /> İlana hazır
          </button>
          <button className={btnCls} disabled={pending} onClick={() => durumDegistir("LISTELENDI")}>
            Listelendi
          </button>
          <button className={btnCls} disabled={pending} onClick={() => durumDegistir("TASLAK")}>
            Taslağa al
          </button>
          <input
            className={`${inputCls} w-56`}
            placeholder="Ret gerekçesi…"
            value={redSebep}
            onChange={(e) => setRedSebep(e.target.value)}
          />
          <button
            className={`${btnCls} border-[var(--danger-border)] text-[var(--danger)]`}
            disabled={pending || redSebep.trim().length < 3}
            onClick={() => durumDegistir("REDDEDILDI")}
          >
            <Ban size={12} /> Reddet
          </button>
        </div>
      </Card>
    </div>
  );
}
