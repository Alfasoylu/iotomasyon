"use client";

/**
 * Phase 78 — BulkImportForm
 *
 * Client component that handles:
 *   1. CSV template download (link to /api/products/bulk-export)
 *   2. CSV file upload → POST /api/products/bulk-import
 *   3. Result summary display (updated / skipped / errors)
 */

import { useRef, useState } from "react";

type ImportResult = {
  updated: number;
  skipped: number;
  errors: string[];
};

type Props = {
  totalProducts: number;
  missingCost: number;
  missingWeight: number;
};

export function BulkImportForm({ totalProducts, missingCost, missingWeight }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setResult(null);
    setError(null);
  }

  async function handleUpload() {
    if (!file) return;
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const body = new FormData();
      body.append("file", file);

      const res = await fetch("/api/products/bulk-import", {
        method: "POST",
        body,
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error ?? "Bilinmeyen hata");
        return;
      }

      setResult(json as ImportResult);
      // Reset file input after successful upload
      if (fileRef.current) fileRef.current.value = "";
      setFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ağ hatası");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Stats row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Toplam Aktif Ürün" value={totalProducts} color="slate" />
        <StatCard
          label="Kaynak Maliyet Eksik (RMB)"
          value={missingCost}
          color={missingCost > 0 ? "amber" : "emerald"}
          suffix={totalProducts > 0 ? `/ ${totalProducts}` : undefined}
        />
        <StatCard
          label="Ağırlık Eksik (kg)"
          value={missingWeight}
          color={missingWeight > 0 ? "amber" : "emerald"}
          suffix={totalProducts > 0 ? `/ ${totalProducts}` : undefined}
        />
      </div>

      {/* Step 1 — Download */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-base font-semibold text-slate-900">
          <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">1</span>
          Şablonu İndir
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          Tüm aktif ürünleri içeren CSV dosyasını indir. Eksik alanlar boş bırakılmış olacak —
          Excel&apos;de aç, sütunları doldur, CSV olarak kaydet.
        </p>
        <div className="mt-4">
          <a
            href="/api/products/bulk-export"
            download
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 transition"
          >
            ⬇ CSV Şablonunu İndir
          </a>
        </div>
        <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
          <p className="font-medium text-slate-700 mb-1">Sütunlar:</p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
            {[
              { col: "sku", note: "Sadece okunur" },
              { col: "name", note: "Sadece okunur" },
              { col: "sourceCostRmb", note: "Tedarik maliyeti (¥)" },
              { col: "weightKg", note: "Birim ağırlık" },
              { col: "customsRatePct", note: "Gümrük oranı %" },
              { col: "shippingMethodPref", note: "AIR veya SEA" },
              { col: "importPaymentFeePct", note: "Ödeme komisyonu %" },
            ].map(({ col, note }) => (
              <div key={col}>
                <span className="font-mono text-slate-800">{col}</span>
                <span className="ml-1 text-slate-400">— {note}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-slate-400">
            Boş bırakılan hücreler mevcut değeri korur. SKU ve name sütunları asla değiştirilmez.
          </p>
        </div>
      </section>

      {/* Step 2 — Upload */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-base font-semibold text-slate-900">
          <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">2</span>
          Doldurulmuş CSV&apos;yi Yükle
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          Excel&apos;de doldurup CSV olarak kaydettiğiniz dosyayı seçin. Her yükleme mevcut değerlerin
          üzerine yazar (boş hücreler hariç).
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="cursor-pointer rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={handleFileChange}
            />
            {file ? `📄 ${file.name}` : "Dosya Seç (.csv)"}
          </label>

          {file && (
            <button
              onClick={handleUpload}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition"
            >
              {loading ? "Yükleniyor…" : "⬆ Yükle ve Güncelle"}
            </button>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mt-4 rounded-lg bg-red-50 border border-red-200 p-4">
            <p className="text-sm font-semibold text-red-700">Hata</p>
            <p className="mt-1 text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="mt-4 space-y-3">
            <div className={`rounded-lg border p-4 ${result.errors.length === 0 ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
              <p className={`text-sm font-semibold ${result.errors.length === 0 ? "text-emerald-800" : "text-amber-800"}`}>
                {result.errors.length === 0 ? "✓ Yükleme tamamlandı" : "⚠ Yükleme tamamlandı (bazı hatalar)"}
              </p>
              <div className="mt-2 flex flex-wrap gap-4 text-sm">
                <span className="text-emerald-700 font-medium">{result.updated} ürün güncellendi</span>
                <span className="text-slate-500">{result.skipped} satır atlandı (boş/değişiklik yok)</span>
                {result.errors.length > 0 && (
                  <span className="text-red-600 font-medium">{result.errors.length} hata</span>
                )}
              </div>
            </div>

            {result.errors.length > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                <p className="text-sm font-semibold text-red-700 mb-2">Hatalar:</p>
                <ul className="space-y-1">
                  {result.errors.map((e, i) => (
                    <li key={i} className="text-xs text-red-600 font-mono">{e}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Instructions */}
      <section className="rounded-xl border border-dashed border-slate-200 p-5 text-sm text-slate-500">
        <p className="font-medium text-slate-700 mb-2">İpuçları</p>
        <ul className="space-y-1 list-disc list-inside">
          <li>Şablonu her zaman tekrar indirebilirsiniz — en güncel veriyi yansıtır.</li>
          <li>Excel&apos;de düzenleyip <strong>CSV (UTF-8)</strong> formatında kaydedin.</li>
          <li>shippingMethodPref için yalnızca <code className="font-mono bg-slate-100 px-1 rounded">AIR</code> veya <code className="font-mono bg-slate-100 px-1 rounded">SEA</code> girin (büyük/küçük harf fark etmez).</li>
          <li>Değiştirmek istemediğiniz hücreleri boş bırakın — mevcut değer korunur.</li>
          <li>Aynı dosyayı birden fazla kez yüklemek güvenlidir (idempotent).</li>
        </ul>
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
  suffix,
}: {
  label: string;
  value: number;
  color: "slate" | "amber" | "emerald";
  suffix?: string;
}) {
  const colorMap = {
    slate: "bg-white border-slate-200 text-slate-900",
    amber: "bg-amber-50 border-amber-200 text-amber-800",
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-800",
  };
  return (
    <div className={`rounded-xl border p-5 ${colorMap[color]}`}>
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
      <p className="mt-1 text-2xl font-bold">
        {value.toLocaleString("tr-TR")}
        {suffix && <span className="ml-1 text-sm font-normal text-slate-400">{suffix}</span>}
      </p>
    </div>
  );
}
