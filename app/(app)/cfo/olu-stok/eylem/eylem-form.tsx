"use client";
/**
 * Ölü stok eylem formu — fiyat, içerik ve bağımsız yeni ilan (Trendyol + PttAVM), AI görsel yükleme, işlem sonucu. Her gönderim
 * "ONAYLIYORUM" ister; kural kontrolü (taban, ±%50, mükerrer ilan onayı) sunucuda yeniden yapılır.
 */
import { useState, useTransition } from "react";
import { applyContentAction, applyPriceChangeAction, applyPttContentAction, checkTrackingAction, createIndependentListingAction,
  createIndependentPttListingAction, uploadListingImagesAction } from "@/lib/actions/olu-stok-actions";

type Channel = "TRENDYOL" | "PTTAVM";
type Props = { sku: string; name: string; barcode: string | null; oldPrice: number | null; floors: Record<string, number | null>;
  suggested: Record<string, number>; gates: Record<Channel, boolean>; description: string | null; imageUrl: string | null };
type Mode = "fiyat" | "icerik" | "ilan" | "sonuc";

const inp = "w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-1)] px-2 py-1 text-[12px]";
const btn = "rounded-md border border-[var(--border-default)] px-2 py-1 text-[11px] text-[var(--text-secondary)] hover:text-[var(--accent)] disabled:opacity-50";
const num = (s: string) => (s.trim() === "" ? NaN : Number(s.replace(",", ".")));
const opt = (s: string) => (s.trim() === "" ? undefined : num(s));
const lines = (s: string) => s.split(/\s+/).map(x => x.trim()).filter(Boolean);

export function EylemForm(p: Props) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [channel, setChannel] = useState<Channel>("TRENDYOL");
  const [f, setF] = useState<Record<string, string>>({});
  const [large, setLarge] = useState(false);
  const [dup, setDup] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [lastId, setLastId] = useState<{ channel: Channel; id: string } | null>(null);
  const [pending, start] = useTransition();
  const [uploading, startUpload] = useTransition();
  const v = (k: string, d = "") => f[k] ?? d;
  const set = (k: string) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  function open(m: Mode) {
    setMode(mode === m ? null : m); setMsg(null);
    if (m !== "sonuc" && !p.gates[channel]) setChannel(p.gates.TRENDYOL ? "TRENDYOL" : "PTTAVM");
    if (m === "fiyat") setF({ barcode: p.barcode ?? "", oldPrice: p.oldPrice?.toString() ?? "", newPrice: p.suggested[channel]?.toString() ?? "" });
    if (m === "icerik") setF({ title: p.name, description: p.description ?? "", images: p.imageUrl ?? "" });
    if (m === "ilan") setF({ title: "", description: "", images: "", vatRate: "20", salePrice: p.suggested[channel]?.toString() ?? "" });
    if (m === "icerik" || m === "ilan") setF(prev => ({ ...prev, barcode: p.barcode ?? "" }));
  }

  function run() {
    start(async () => {
      const confirm = v("confirm");
      const r =
        mode === "fiyat" ? await applyPriceChangeAction({ channel, sku: p.sku, barcode: v("barcode"), newPrice: num(v("newPrice")),
            oldPrice: Number.isFinite(num(v("oldPrice"))) ? num(v("oldPrice")) : null, confirm, confirmLarge: large })
        : mode === "icerik" && channel === "PTTAVM" ? await applyPttContentAction({ sku: p.sku, barcode: v("barcode"), name: v("title") || undefined,
            longDescription: v("description") || undefined, images: v("images") ? lines(v("images")) : undefined, confirm })
        : mode === "ilan" && channel === "PTTAVM" ? await createIndependentPttListingAction({ sku: p.sku, name: v("title"), longDescription: v("description"),
            categoryId: opt(v("categoryId")), priceWithVat: num(v("salePrice")), vatRate: num(v("vatRate")), desi: num(v("desi")), brand: v("brand") || undefined,
            images: lines(v("images")), sourceBarcode: v("barcode") || undefined, acknowledgeDuplicateRisk: dup as true, confirm })
        : mode === "icerik" ? await applyContentAction({ sku: p.sku, contentId: opt(v("contentId")), title: v("title") || undefined,
            description: v("description") || undefined, images: v("images") ? lines(v("images")) : undefined, confirm })
        : mode === "ilan" ? await createIndependentListingAction({ sku: p.sku, title: v("title"), description: v("description"),
            brandId: opt(v("brandId")), categoryId: opt(v("categoryId")), listPrice: num(v("listPrice") || v("salePrice")), salePrice: num(v("salePrice")),
            vatRate: num(v("vatRate")), dimensionalWeight: num(v("desi")), images: lines(v("images")),
            attributes: v("attributes") ? JSON.parse(v("attributes")) : undefined, acknowledgeDuplicateRisk: dup as true, confirm })
        : await checkTrackingAction(channel, v("trackingId") || lastId?.id || "");
      const extra = "result" in r && r.result ? ` ${JSON.stringify(r.result).slice(0, 600)}` : "";
      setMsg({ ok: r.ok, text: (r.message ?? (r.ok ? "Tamam" : "Hata")) + extra });
      if ("trackingId" in r && r.trackingId) setLastId({ channel, id: r.trackingId });
    });
  }

  function upload(files: FileList | null) {
    if (!files?.length) return;
    const fd = new FormData(); fd.set("sku", p.sku); for (const file of Array.from(files)) fd.append("files", file);
    startUpload(async () => {
      const r = await uploadListingImagesAction(fd);
      setMsg({ ok: r.ok, text: r.message ?? (r.ok ? "Yüklendi" : "Hata") });
      if (r.urls?.length) setF(prev => ({ ...prev, images: [prev.images ?? "", ...r.urls!].filter(Boolean).join("\n") }));
    });
  }

  const field = (k: string, label: string, ph = "") => (
    <label className="block text-[11px] text-[var(--text-muted)]">{label}<input className={inp} value={v(k)} onChange={set(k)} placeholder={ph} /></label>
  );

  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-2">
        <button className={btn} onClick={() => open("fiyat")}>Fiyat değiştir</button>
        <button className={btn} onClick={() => open("icerik")} disabled={!p.gates.TRENDYOL && !p.gates.PTTAVM}>İçerik (başlık/açıklama/görsel)</button>
        <button className={btn} onClick={() => open("ilan")} disabled={!p.gates.TRENDYOL && !p.gates.PTTAVM}>Yeni bağımsız ilan</button>
        <button className={btn} onClick={() => open("sonuc")}>İşlem sonucu</button>
      </div>
      {mode && (
        <div className="mt-2 grid gap-2 rounded-md border border-[var(--border-default)] p-3 sm:grid-cols-2">
          {mode && (
            <label className="block text-[11px] text-[var(--text-muted)]">Kanal
              <select className={inp} value={channel} onChange={e => setChannel(e.target.value as Channel)}>
                <option value="TRENDYOL" disabled={mode !== "sonuc" && !p.gates.TRENDYOL}>Trendyol</option>
                <option value="PTTAVM" disabled={mode !== "sonuc" && !p.gates.PTTAVM}>PttAVM</option>
              </select>
            </label>
          )}
          {mode === "fiyat" && <>
            {field("barcode", "Pazaryeri barkodu")}
            {field("oldPrice", "Mevcut fiyat (TL)")}
            {field("newPrice", `Yeni fiyat (TL) — taban ${p.floors[channel] ?? "bilinmiyor"}`)}
            <label className="text-[11px] text-[var(--text-muted)]"><input type="checkbox" checked={large} onChange={e => setLarge(e.target.checked)} /> ±%50 üstü değişimi onaylıyorum</label>
          </>}
          {mode === "icerik" && <>
            {channel === "TRENDYOL" ? field("contentId", "Trendyol contentId (boşsa barkoddan bulunur)") : field("barcode", "PttAVM barkodu (stok kodu) — ürün var ve varyantsız olmalı")}
            {field("title", channel === "TRENDYOL" ? "Başlık (≤ 100)" : "Ürün adı (≤ 200)")}
            <label className="block text-[11px] text-[var(--text-muted)] sm:col-span-2">Açıklama (HTML)<textarea className={inp} rows={4} value={v("description")} onChange={set("description")} /></label>
            <label className="block text-[11px] text-[var(--text-muted)] sm:col-span-2">Görseller (https, en fazla 8, boşlukla ayır)<textarea className={inp} rows={2} value={v("images")} onChange={set("images")} /></label>
          </>}
          {mode === "ilan" && <>
            {field("title", `YENİ ${channel === "TRENDYOL" ? "başlık (≤ 100)" : "ürün adı (≤ 200)"} — mevcut ilandan farklı`, "mevcut başlığa en fazla %60 benzeyebilir")}
            {channel === "TRENDYOL" ? field("brandId", "Marka id (boşsa mevcut ilandan)") : field("brand", "Marka (isteğe bağlı)")}
            {field("categoryId", "Kategori id (boşsa mevcut ilandan)")}
            {channel === "PTTAVM" && field("barcode", "Kaynak PttAVM barkodu (kategori/kopya kontrolü için)")}
            {field("desi", "Desi")}
            {field("salePrice", `${channel === "TRENDYOL" ? "Satış" : "KDV dahil"} fiyatı (TL) — taban ${p.floors[channel] ?? "bilinmiyor"}`)}
            {channel === "TRENDYOL" && field("listPrice", "Liste fiyatı (TL, boşsa satış)")}
            {field("vatRate", "KDV (0/1/10/20)")}
            {channel === "TRENDYOL" && field("attributes", "Özellikler JSON (boşsa mevcut ilandan)", '[{"attributeId":1,"attributeValueId":2}]')}
            <label className="block text-[11px] text-[var(--text-muted)] sm:col-span-2">Açıklama (HTML)<textarea className={inp} rows={4} value={v("description")} onChange={set("description")} /></label>
            <label className="block text-[11px] text-[var(--text-muted)] sm:col-span-2">YENİ görseller (AI ile üretilmiş, https 1200×1800, en fazla 8 — mevcut görseller kabul edilmez)<textarea className={inp} rows={2} value={v("images")} onChange={set("images")} /></label>
            <label className="text-[11px] text-[var(--warn)] sm:col-span-2"><input type="checkbox" checked={dup} onChange={e => setDup(e.target.checked)} /> Mükerrer ilan riskini biliyorum (ayrı SKU/barkod, stok XML&apos;den)</label>
          </>}
          {(mode === "icerik" || mode === "ilan") && (
            <label className="block text-[11px] text-[var(--text-muted)] sm:col-span-2">AI görsel yükle (JPEG/PNG/WebP, ≤ 10 MB, en fazla 8 — adresler yukarıya eklenir)
              <input type="file" multiple accept="image/jpeg,image/png,image/webp" className={inp} disabled={uploading} onChange={e => upload(e.target.files)} />
            </label>
          )}
          {mode === "sonuc" && field("trackingId", "İşlem no", lastId?.id ?? "")}
          {mode !== "sonuc" && field("confirm", 'Onay: "ONAYLIYORUM" yazın')}
          <div className="flex items-end"><button className={btn} disabled={pending} onClick={run}>{pending ? "Gönderiliyor…" : mode === "sonuc" ? "Sorgula" : "Gönder"}</button></div>
        </div>
      )}
      {msg && <p className={`mt-2 break-all text-[11px] ${msg.ok ? "text-[var(--ok)]" : "text-[var(--danger)]"}`}>{msg.text}</p>}
    </div>
  );
}
