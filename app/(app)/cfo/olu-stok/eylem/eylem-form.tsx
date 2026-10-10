"use client";
/**
 * Ölü stok eylem formu — fiyat (Trendyol/PttAVM), Trendyol içerik, Trendyol bağımsız yeni ilan, işlem sonucu. Her gönderim
 * "ONAYLIYORUM" ister; kural kontrolü (taban, ±%50, mükerrer ilan onayı) sunucuda yeniden yapılır.
 */
import { useState, useTransition } from "react";
import { applyContentAction, applyPriceChangeAction, checkTrackingAction, createIndependentListingAction } from "@/lib/actions/olu-stok-actions";

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
  const v = (k: string, d = "") => f[k] ?? d;
  const set = (k: string) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  function open(m: Mode) {
    setMode(mode === m ? null : m); setMsg(null);
    if (m === "fiyat") setF({ barcode: p.barcode ?? "", oldPrice: p.oldPrice?.toString() ?? "", newPrice: p.suggested[channel]?.toString() ?? "" });
    if (m === "icerik") setF({ title: p.name, description: p.description ?? "", images: p.imageUrl ?? "" });
    if (m === "ilan") setF({ title: "", description: "", images: "", vatRate: "20", salePrice: p.suggested.TRENDYOL?.toString() ?? "" });
  }

  function run() {
    start(async () => {
      const confirm = v("confirm");
      const r =
        mode === "fiyat" ? await applyPriceChangeAction({ channel, sku: p.sku, barcode: v("barcode"), newPrice: num(v("newPrice")),
            oldPrice: Number.isFinite(num(v("oldPrice"))) ? num(v("oldPrice")) : null, confirm, confirmLarge: large })
        : mode === "icerik" ? await applyContentAction({ sku: p.sku, contentId: opt(v("contentId")), title: v("title") || undefined,
            description: v("description") || undefined, images: v("images") ? lines(v("images")) : undefined, confirm })
        : mode === "ilan" ? await createIndependentListingAction({ sku: p.sku, title: v("title"), description: v("description"),
            brandId: opt(v("brandId")), categoryId: opt(v("categoryId")), listPrice: num(v("listPrice") || v("salePrice")), salePrice: num(v("salePrice")),
            vatRate: num(v("vatRate")), dimensionalWeight: num(v("desi")), images: lines(v("images")),
            attributes: v("attributes") ? JSON.parse(v("attributes")) : undefined, acknowledgeDuplicateRisk: dup as true, confirm })
        : await checkTrackingAction(channel, v("trackingId") || lastId?.id || "");
      const extra = "result" in r && r.result ? ` ${JSON.stringify(r.result).slice(0, 600)}` : "";
      setMsg({ ok: r.ok, text: (r.message ?? (r.ok ? "Tamam" : "Hata")) + extra });
      if ("trackingId" in r && r.trackingId) setLastId({ channel: mode === "fiyat" ? channel : "TRENDYOL", id: r.trackingId });
    });
  }

  const field = (k: string, label: string, ph = "") => (
    <label className="block text-[11px] text-[var(--text-muted)]">{label}<input className={inp} value={v(k)} onChange={set(k)} placeholder={ph} /></label>
  );

  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-2">
        <button className={btn} onClick={() => open("fiyat")}>Fiyat değiştir</button>
        <button className={btn} onClick={() => open("icerik")} disabled={!p.gates.TRENDYOL}>İçerik (Trendyol)</button>
        <button className={btn} onClick={() => open("ilan")} disabled={!p.gates.TRENDYOL}>Yeni bağımsız ilan (Trendyol)</button>
        <button className={btn} onClick={() => open("sonuc")}>İşlem sonucu</button>
      </div>
      {mode && (
        <div className="mt-2 grid gap-2 rounded-md border border-[var(--border-default)] p-3 sm:grid-cols-2">
          {(mode === "fiyat" || mode === "sonuc") && (
            <label className="block text-[11px] text-[var(--text-muted)]">Kanal
              <select className={inp} value={channel} onChange={e => setChannel(e.target.value as Channel)}>
                <option value="TRENDYOL" disabled={mode === "fiyat" && !p.gates.TRENDYOL}>Trendyol</option>
                <option value="PTTAVM" disabled={mode === "fiyat" && !p.gates.PTTAVM}>PttAVM</option>
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
            {field("contentId", "Trendyol contentId (boşsa barkoddan bulunur)")}
            {field("title", "Başlık (≤ 100)")}
            <label className="block text-[11px] text-[var(--text-muted)] sm:col-span-2">Açıklama (HTML)<textarea className={inp} rows={4} value={v("description")} onChange={set("description")} /></label>
            <label className="block text-[11px] text-[var(--text-muted)] sm:col-span-2">Görseller (https, en fazla 8, boşlukla ayır)<textarea className={inp} rows={2} value={v("images")} onChange={set("images")} /></label>
          </>}
          {mode === "ilan" && <>
            {field("title", "YENİ başlık (≤ 100, mevcut ilandan farklı)", "mevcut başlığa en fazla %60 benzeyebilir")}
            {field("brandId", "Marka id (boşsa mevcut ilandan)")}
            {field("categoryId", "Kategori id (boşsa mevcut ilandan)")}
            {field("desi", "Desi")}
            {field("salePrice", `Satış fiyatı (TL) — taban ${p.floors.TRENDYOL ?? "bilinmiyor"}`)}
            {field("listPrice", "Liste fiyatı (TL, boşsa satış)")}
            {field("vatRate", "KDV (0/1/10/20)")}
            {field("attributes", "Özellikler JSON (boşsa mevcut ilandan)", '[{"attributeId":1,"attributeValueId":2}]')}
            <label className="block text-[11px] text-[var(--text-muted)] sm:col-span-2">Açıklama (HTML)<textarea className={inp} rows={4} value={v("description")} onChange={set("description")} /></label>
            <label className="block text-[11px] text-[var(--text-muted)] sm:col-span-2">YENİ görseller (AI ile üretilmiş, https 1200×1800, en fazla 8 — mevcut görseller kabul edilmez)<textarea className={inp} rows={2} value={v("images")} onChange={set("images")} /></label>
            <label className="text-[11px] text-[var(--warn)] sm:col-span-2"><input type="checkbox" checked={dup} onChange={e => setDup(e.target.checked)} /> Mükerrer ilan riskini biliyorum (ayrı SKU/barkod, stok XML&apos;den)</label>
          </>}
          {mode === "sonuc" && field("trackingId", "İşlem no", lastId?.id ?? "")}
          {mode !== "sonuc" && field("confirm", 'Onay: "ONAYLIYORUM" yazın')}
          <div className="flex items-end"><button className={btn} disabled={pending} onClick={run}>{pending ? "Gönderiliyor…" : mode === "sonuc" ? "Sorgula" : "Gönder"}</button></div>
        </div>
      )}
      {msg && <p className={`mt-2 break-all text-[11px] ${msg.ok ? "text-[var(--ok)]" : "text-[var(--danger)]"}`}>{msg.text}</p>}
    </div>
  );
}
