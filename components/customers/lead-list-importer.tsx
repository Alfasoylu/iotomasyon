"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload, Check, AlertTriangle } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  previewLeadListAction,
  createLeadListAction,
  type LeadRow,
  type LeadListPreview,
} from "@/lib/actions/lead-list-actions";

type Source = "Google Maps" | "Manuel" | "Trendyol Q&A" | "Diğer";
type Phase = "input" | "preview" | "done";

const SOURCES: Source[] = ["Google Maps", "Manuel", "Trendyol Q&A", "Diğer"];

const CUSTOMER_TYPES = [
  { value: "", label: "— Seç —" },
  { value: "TOPTAN", label: "TOPTAN (B2B)" },
  { value: "PERAKENDE", label: "PERAKENDE (B2C)" },
  { value: "GUVENLIK_SIRKETI", label: "Güvenlik Şirketi" },
  { value: "SITE_YONETICISI", label: "Site Yöneticisi" },
  { value: "MAGAZA", label: "Mağaza" },
  { value: "ONLINE_SATICI", label: "Online Satıcı" },
];

export function LeadListImporter() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("input");
  const [name, setName] = useState("");
  const [source, setSource] = useState<Source>("Google Maps");
  const [city, setCity] = useState("");
  const [category, setCategory] = useState("");
  const [customerType, setCustomerType] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [csvText, setCsvText] = useState("");
  const [delimiter, setDelimiter] = useState<";" | "," | "\t">(",");
  const [parsedRows, setParsedRows] = useState<LeadRow[]>([]);
  const [preview, setPreview] = useState<LeadListPreview | null>(null);
  const [addExistingAsMembers, setAddExistingAsMembers] = useState(true);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [doneSummary, setDoneSummary] = useState<{ created: number; skipped: number; leadListId: string } | null>(null);

  function parsePasteText(text: string): LeadRow[] {
    // Her satır 1 firma. Format: "İsim, Telefon, [Şehir], [İlçe], [Adres]"
    return text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line): LeadRow => {
        const parts = line.split(",").map((p) => p.trim());
        return {
          name: parts[0] || "",
          phone: parts[1] || null,
          city: parts[2] || null,
          district: parts[3] || null,
          address: parts[4] || null,
        };
      })
      .filter((r) => r.name);
  }

  function parseCsvText(text: string): LeadRow[] {
    const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
    if (lines.length === 0) return [];
    // İlk satırı header olarak kullan
    const header = lines[0].split(delimiter).map((h) => h.trim().toLowerCase().replace(/['"]/g, ""));
    const idx = {
      name: header.findIndex((h) => /name|ad|firma|şirket|company|business/i.test(h)),
      phone: header.findIndex((h) => /phone|tel|telefon|number/i.test(h)),
      whatsapp: header.findIndex((h) => /whatsapp|wa/i.test(h)),
      email: header.findIndex((h) => /email|e-mail|e-posta|mail/i.test(h)),
      city: header.findIndex((h) => /city|şehir|il\b/i.test(h)),
      district: header.findIndex((h) => /district|ilçe|district/i.test(h)),
      address: header.findIndex((h) => /address|adres/i.test(h)),
      website: header.findIndex((h) => /website|site|web|url/i.test(h)),
      category: header.findIndex((h) => /category|kategori/i.test(h)),
    };
    return lines.slice(1).map((line): LeadRow => {
      const parts = line.split(delimiter).map((p) => p.trim().replace(/^["']|["']$/g, ""));
      return {
        name: idx.name >= 0 ? parts[idx.name] || "" : parts[0] || "",
        phone: idx.phone >= 0 ? parts[idx.phone] || null : null,
        whatsapp: idx.whatsapp >= 0 ? parts[idx.whatsapp] || null : null,
        email: idx.email >= 0 ? parts[idx.email] || null : null,
        city: idx.city >= 0 ? parts[idx.city] || null : null,
        district: idx.district >= 0 ? parts[idx.district] || null : null,
        address: idx.address >= 0 ? parts[idx.address] || null : null,
        website: idx.website >= 0 ? parts[idx.website] || null : null,
        category: idx.category >= 0 ? parts[idx.category] || null : null,
      };
    }).filter((r) => r.name);
  }

  function handlePreview() {
    setError(null);
    const rows = csvText.trim() ? parseCsvText(csvText) : parsePasteText(pasteText);

    if (!name.trim()) {
      setError("Liste adı gerekli.");
      return;
    }
    if (rows.length === 0) {
      setError("En az 1 satır gerekli.");
      return;
    }

    setParsedRows(rows);
    startTransition(async () => {
      const result = await previewLeadListAction({ rows });
      if (result.ok && result.preview) {
        setPreview(result.preview);
        setPhase("preview");
      } else {
        setError(result.message ?? "Önizleme alınamadı.");
      }
    });
  }

  function handleImport() {
    setError(null);
    startTransition(async () => {
      const result = await createLeadListAction({
        name: name.trim(),
        source,
        city: city.trim() || undefined,
        category: category.trim() || undefined,
        customerType: customerType || undefined,
        rows: parsedRows,
        addExistingAsMembers,
      });
      if (result.ok && result.leadListId) {
        setDoneSummary({
          created: result.created ?? 0,
          skipped: result.skipped ?? 0,
          leadListId: result.leadListId,
        });
        setPhase("done");
      } else {
        setError(result.message ?? "Import başarısız.");
      }
    });
  }

  if (phase === "done" && doneSummary) {
    return (
      <Card className="p-8 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-[var(--ok-border)] bg-[var(--ok-dim)]">
          <Check size={32} strokeWidth={1.5} className="text-[var(--ok)]" />
        </div>
        <h2 className="mt-4 text-xl font-semibold text-[var(--text-primary)]">Import tamamlandı</h2>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          <strong className="font-mono tabular-nums text-[var(--ok)]">{doneSummary.created}</strong> yeni müşteri eklendi
          {doneSummary.skipped > 0 && (
            <span>
              , <strong className="font-mono tabular-nums text-[var(--text-primary)]">{doneSummary.skipped}</strong> atlandı
            </span>
          )}
          .
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button onClick={() => router.push("/customers?cohort=queue")}>
            Power Queue&apos;ya git
          </Button>
          <Button variant="secondary" onClick={() => router.push("/customers/lists")}>
            Listeleri gör
          </Button>
        </div>
      </Card>
    );
  }

  if (phase === "preview" && preview) {
    return (
      <Card className="space-y-4 p-6">
        <h2 className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
          Önizleme — <span className="text-[var(--text-primary)]">{name}</span>
        </h2>
        <p className="text-sm text-[var(--text-secondary)]">
          Kaynak: <strong className="text-[var(--text-primary)]">{source}</strong>
          {city && <> · Şehir: <strong className="text-[var(--text-primary)]">{city}</strong></>}
          {category && <> · Kategori: <strong className="text-[var(--text-primary)]">{category}</strong></>}
        </p>

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-md border border-[var(--ok-border)] bg-[var(--ok-dim)] p-3 text-center">
            <p className="font-mono text-3xl font-semibold tabular-nums text-[var(--ok)]">{preview.newCount}</p>
            <p className="mt-1 text-[11px] uppercase tracking-widest text-[var(--ok)]">Yeni eklenecek</p>
          </div>
          <div className="rounded-md border border-[var(--warn-border)] bg-[var(--warn-dim)] p-3 text-center">
            <p className="font-mono text-3xl font-semibold tabular-nums text-[var(--warn)]">{preview.duplicateCount}</p>
            <p className="mt-1 text-[11px] uppercase tracking-widest text-[var(--warn)]">Telefon kayıtlı</p>
          </div>
          <div className="rounded-md border border-[var(--danger-border)] bg-[var(--danger-dim)] p-3 text-center">
            <p className="font-mono text-3xl font-semibold tabular-nums text-[var(--danger)]">{preview.invalidCount}</p>
            <p className="mt-1 text-[11px] uppercase tracking-widest text-[var(--danger)]">Hatalı (atlanacak)</p>
          </div>
        </div>

        {preview.duplicates.length > 0 && (
          <details className="rounded-md border border-[var(--border-default)] bg-[var(--surface-1)] p-3">
            <summary className="cursor-pointer text-sm font-medium text-[var(--text-secondary)]">
              Duplikat detay (<span className="tabular-nums">{preview.duplicates.length}</span>)
            </summary>
            <ul className="mt-2 space-y-1 text-xs">
              {preview.duplicates.slice(0, 20).map((d, i) => (
                <li key={i} className="text-[var(--text-secondary)]">
                  • {d.name} ({d.phone})
                </li>
              ))}
              {preview.duplicates.length > 20 && (
                <li className="text-[var(--text-muted)]">+ {preview.duplicates.length - 20} daha</li>
              )}
            </ul>
            <label className="mt-3 flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={addExistingAsMembers}
                onChange={(e) => setAddExistingAsMembers(e.target.checked)}
              />
              Duplikatları yine de bu listenin üyesi yap (membership-only)
            </label>
          </details>
        )}

        {preview.invalids.length > 0 && (
          <details className="rounded-md border border-[var(--danger-border)] bg-[var(--danger-dim)] p-3">
            <summary className="cursor-pointer text-sm font-medium text-[var(--danger)]">
              Hatalı satırlar (<span className="tabular-nums">{preview.invalids.length}</span>)
            </summary>
            <ul className="mt-2 space-y-1 text-xs">
              {preview.invalids.slice(0, 20).map((inv, i) => (
                <li key={i} className="text-[var(--danger)]">
                  Satır {inv.row}: {inv.name} → {inv.reason}
                </li>
              ))}
            </ul>
          </details>
        )}

        {error && (
          <p className="rounded-md border border-[var(--danger-border)] bg-[var(--danger-dim)] p-3 text-sm text-[var(--danger)]">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={() => setPhase("input")}>Geri</Button>
          <Button onClick={handleImport} disabled={pending}>
            {pending ? "Import ediliyor..." : `${preview.newCount} müşteri ekle`}
          </Button>
        </div>
      </Card>
    );
  }

  const inputCls =
    "w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-border)]";
  const labelCls =
    "mb-1 block text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]";

  return (
    <Card className="space-y-4 p-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelCls}>Liste Adı *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="örn. Hatay güvenlik şirketleri Mayıs 2026"
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Kaynak</label>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value as Source)}
            className={inputCls}
          >
            {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Şehir (opsiyonel)</label>
          <input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Hatay, İstanbul..."
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Kategori (opsiyonel)</label>
          <input
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Güvenlik, Site Yönetimi..."
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Müşteri Tipi (opsiyonel)</label>
          <select
            value={customerType}
            onChange={(e) => setCustomerType(e.target.value)}
            className={inputCls}
          >
            {CUSTOMER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
      </div>

      <div className="space-y-3 border-t border-[var(--border-subtle)] pt-4">
        <div>
          <label className={labelCls}>Veri Girişi (1: Yapıştır)</label>
          <textarea
            value={pasteText}
            onChange={(e) => { setPasteText(e.target.value); setCsvText(""); }}
            placeholder={`Her satır 1 firma — format: "İsim, Telefon, Şehir, İlçe, Adres"\n\nABC Güvenlik, 0212 555 0001, İstanbul, Beşiktaş\nXYZ Sistem, 0532 555 0002, İstanbul, Kadıköy`}
            rows={6}
            className={`${inputCls} font-mono text-xs`}
          />
        </div>

        <div className="text-center text-xs text-[var(--text-muted)]">— veya —</div>

        <div>
          <label className={labelCls}>Veri Girişi (2: CSV yapıştır — ilk satır header)</label>
          <div className="mb-1 flex gap-2">
            <span className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">Ayırıcı:</span>
            {([",", ";", "\t"] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDelimiter(d)}
                className={`rounded-md border px-2 py-0.5 text-[10px] font-medium transition ${
                  delimiter === d
                    ? "border-[var(--accent-border)] bg-[var(--accent-dim)] text-[var(--accent)]"
                    : "border-[var(--border-subtle)] bg-[var(--surface-3)] text-[var(--text-secondary)] hover:border-[var(--border-default)]"
                }`}
              >
                {d === "\t" ? "tab" : `'${d}'`}
              </button>
            ))}
          </div>
          <textarea
            value={csvText}
            onChange={(e) => { setCsvText(e.target.value); setPasteText(""); }}
            placeholder={`name,phone,city,address\n"ABC Güvenlik","+90 212 555 0001","İstanbul","Beşiktaş Cd. No:1"\n"XYZ Sistem","+90 532 555 0002","İstanbul","Kadıköy Mah."`}
            rows={6}
            className={`${inputCls} font-mono text-xs`}
          />
          <p className="mt-1 text-[10px] text-[var(--text-muted)]">
            Header kolon adları otomatik algılanır: name, phone, whatsapp, email, city, district, address, website, category.
          </p>
        </div>
      </div>

      {error && (
        <p className="flex items-center gap-2 rounded-md border border-[var(--danger-border)] bg-[var(--danger-dim)] p-3 text-sm text-[var(--danger)]">
          <AlertTriangle size={14} strokeWidth={1.5} className="flex-shrink-0" />
          {error}
        </p>
      )}

      <div className="flex justify-end pt-2">
        <Button onClick={handlePreview} disabled={pending || !name.trim() || (!pasteText && !csvText)}>
          <Upload size={14} strokeWidth={1.5} className="mr-1.5" />
          {pending ? "Hazırlanıyor..." : "Önizle"}
        </Button>
      </div>
    </Card>
  );
}
