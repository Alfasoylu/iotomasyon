"use client";

/**
 * Faz 91 — Trendyol finans dosyası yükleme alanı.
 *
 * Kullanım akışı: Trendyol partner panelinde Finans → Faturalar ekranından
 * dosyalar indirilir ve buraya sürüklenir. Dosya türü otomatik tanınır;
 * kullanıcının hiçbir şey seçmesi gerekmez.
 *
 * Aynı dosyanın tekrar yüklenmesi zararsızdır — yazıcı idempotent, satırlar
 * çoğalmaz (bkz. lib/trendyol-finance/import.ts).
 */

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, FileSpreadsheet, FileText, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type ImportOutcome = {
  fileName: string;
  ok: boolean;
  kind: string | null;
  kindLabel: string | null;
  rowsTotal: number;
  rowsNew: number;
  rowsUpdated: number;
  rowsSkipped: number;
  amountTotalTry: number | null;
  linkedInvoiceNo: string | null;
  message: string;
};

const TRY = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  maximumFractionDigits: 2,
});

export function TrendyolFinanceUpload() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<ImportOutcome[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function upload(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0) return;

    setUploading(true);
    setError(null);
    setResults(null);

    try {
      const body = new FormData();
      for (const f of list) body.append("files", f);

      const res = await fetch("/api/marketplace/trendyol-finance/import", {
        method: "POST",
        body,
      });
      const json = await res.json();

      if (!res.ok) {
        setError(json.error ?? "Yükleme başarısız.");
        return;
      }

      setResults(json.results as ImportOutcome[]);
      // Sayfa verilerini tazele — özet kartları ve tablolar yeni veriyi göstersin.
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme sırasında hata oluştu.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const busy = uploading || isPending;

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!busy) void upload(e.dataTransfer.files);
        }}
        onClick={() => !busy && inputRef.current?.click()}
        className={[
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors",
          dragging
            ? "border-[var(--accent)] bg-[var(--accent-dim)]"
            : "border-[var(--border-default)] bg-[var(--surface-1)] hover:border-[var(--border-strong)]",
          busy ? "pointer-events-none opacity-60" : "",
        ].join(" ")}
      >
        {busy ? (
          <Loader2 size={28} className="animate-spin text-[var(--accent)]" />
        ) : (
          <UploadCloud size={28} className="text-[var(--text-muted)]" />
        )}

        <p className="text-sm font-medium text-[var(--text-primary)]">
          {busy ? "Dosyalar işleniyor…" : "Trendyol fatura dosyalarını buraya sürükleyin"}
        </p>
        <p className="max-w-lg text-xs text-[var(--text-muted)]">
          Fatura listesi, kesinti/kargo/ceza detayları, hakediş dosyaları (.xlsx) ve
          tekil e-faturalar (.pdf). Tür otomatik tanınır, aynı dosyayı tekrar
          yüklemek veriyi bozmaz.
        </p>

        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".xlsx,.xls,.pdf"
          className="hidden"
          onChange={(e) => e.target.files && void upload(e.target.files)}
        />
      </div>

      {error ? (
        <p className="flex items-center gap-2 rounded-md border border-[var(--danger-border)] bg-[var(--danger-dim)] px-3 py-2 text-sm text-[var(--danger)]">
          <AlertCircle size={14} /> {error}
        </p>
      ) : null}

      {results ? (
        <div className="space-y-1.5">
          {results.map((r, i) => (
            <ResultRow key={`${r.fileName}-${i}`} result={r} />
          ))}

          <div className="flex items-center justify-end pt-1">
            <Button variant="ghost" size="sm" onClick={() => setResults(null)}>
              Sonuçları gizle
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ResultRow({ result: r }: { result: ImportOutcome }) {
  const Icon = r.fileName.toLowerCase().endsWith(".pdf") ? FileText : FileSpreadsheet;

  return (
    <div
      className={[
        "flex items-start gap-3 rounded-md border px-3 py-2 text-sm",
        r.ok
          ? "border-[var(--border-subtle)] bg-[var(--surface-1)]"
          : "border-[var(--danger-border)] bg-[var(--danger-dim)]",
      ].join(" ")}
    >
      {r.ok ? (
        <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-[var(--ok)]" />
      ) : (
        <AlertCircle size={15} className="mt-0.5 shrink-0 text-[var(--danger)]" />
      )}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Icon size={13} className="shrink-0 text-[var(--text-muted)]" />
          <span className="truncate font-medium text-[var(--text-primary)]">{r.fileName}</span>
          {r.kindLabel ? <Badge variant="accent">{r.kindLabel}</Badge> : null}
          {r.linkedInvoiceNo ? <Badge variant="ok">{r.linkedInvoiceNo}</Badge> : null}
        </div>

        <p className={`mt-0.5 text-xs ${r.ok ? "text-[var(--text-secondary)]" : "text-[var(--danger)]"}`}>
          {r.message}
        </p>

        {r.ok && r.rowsTotal > 0 ? (
          <p className="mt-0.5 text-[11px] tabular-nums text-[var(--text-muted)]">
            {r.rowsTotal} satır okundu · {r.rowsNew} yeni · {r.rowsUpdated} güncellendi ·{" "}
            {r.rowsSkipped} atlandı
            {r.amountTotalTry != null ? ` · ${TRY.format(r.amountTotalTry)}` : ""}
          </p>
        ) : null}
      </div>
    </div>
  );
}
