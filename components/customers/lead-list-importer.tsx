"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload, Check, AlertTriangle, X } from "lucide-react";

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
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
          <Check className="h-8 w-8 text-emerald-600" />
        </div>
        <h2 className="mt-4 text-xl font-bold text-slate-900">Import tamamlandı!</h2>
        <p className="mt-2 text-sm text-slate-600">
          <strong className="text-emerald-700">{doneSummary.created}</strong> yeni müşteri eklendi
          {doneSummary.skipped > 0 && (
            <span>, <strong className="text-slate-700">{doneSummary.skipped}</strong> atlandı</span>
          )}
          .
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button onClick={() => router.push("/customers?cohort=queue")}>
            Power Queue'ya git → ara!
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
      <Card className="p-6 space-y-4">
        <h2 className="text-base font-semibold text-slate-900">Önizleme — {name}</h2>
        <p className="text-sm text-slate-500">
          Kaynak: <strong>{source}</strong>
          {city && <> · Şehir: <strong>{city}</strong></>}
          {category && <> · Kategori: <strong>{category}</strong></>}
        </p>

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-center">
            <p className="text-3xl font-bold text-emerald-700">{preview.newCount}</p>
            <p className="text-xs text-emerald-700/80 mt-1">Yeni eklenecek</p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-center">
            <p className="text-3xl font-bold text-amber-700">{preview.duplicateCount}</p>
            <p className="text-xs text-amber-700/80 mt-1">Telefon zaten kayıtlı</p>
          </div>
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-center">
            <p className="text-3xl font-bold text-rose-700">{preview.invalidCount}</p>
            <p className="text-xs text-rose-700/80 mt-1">Hatalı (atlanacak)</p>
          </div>
        </div>

        {preview.duplicates.length > 0 && (
          <details className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <summary className="cursor-pointer text-sm font-medium text-slate-700">
              Duplikat detay ({preview.duplicates.length})
            </summary>
            <ul className="mt-2 space-y-1 text-xs">
              {preview.duplicates.slice(0, 20).map((d, i) => (
                <li key={i} className="text-slate-600">
                  • {d.name} ({d.phone})
                </li>
              ))}
              {preview.duplicates.length > 20 && (
                <li className="text-slate-400">+ {preview.duplicates.length - 20} daha</li>
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
          <details className="rounded-lg border border-rose-200 bg-rose-50 p-3">
            <summary className="cursor-pointer text-sm font-medium text-rose-700">
              Hatalı satırlar ({preview.invalids.length})
            </summary>
            <ul className="mt-2 space-y-1 text-xs">
              {preview.invalids.slice(0, 20).map((inv, i) => (
                <li key={i} className="text-rose-700">
                  Satır {inv.row}: {inv.name} → {inv.reason}
                </li>
              ))}
            </ul>
          </details>
        )}

        {error && (
          <p className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700">{error}</p>
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

  return (
    <Card className="p-6 space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Liste Adı *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="örn. Hatay güvenlik şirketleri Mayıs 2026"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Kaynak</label>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value as Source)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Şehir (opsiyonel)</label>
          <input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Hatay, İstanbul..."
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Kategori (opsiyonel)</label>
          <input
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Güvenlik, Site Yönetimi..."
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Müşteri Tipi (opsiyonel)</label>
          <select
            value={customerType}
            onChange={(e) => setCustomerType(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            {CUSTOMER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
      </div>

      <div className="border-t border-slate-100 pt-4 space-y-3">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Veri Girişi (1: Yapıştır)
          </label>
          <textarea
            value={pasteText}
            onChange={(e) => { setPasteText(e.target.value); setCsvText(""); }}
            placeholder={`Her satır 1 firma — format: "İsim, Telefon, Şehir, İlçe, Adres"\n\nABC Güvenlik, 0212 555 0001, İstanbul, Beşiktaş\nXYZ Sistem, 0532 555 0002, İstanbul, Kadıköy`}
            rows={6}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-mono focus:border-slate-400 focus:outline-none"
          />
        </div>

        <div className="text-center text-xs text-slate-400">— veya —</div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Veri Girişi (2: CSV yapıştır — ilk satır header)
          </label>
          <div className="flex gap-2 mb-1">
            <span className="text-[10px] text-slate-500">Ayırıcı:</span>
            {([",", ";", "\t"] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDelimiter(d)}
                className={`text-[10px] px-2 py-0.5 rounded ${delimiter === d ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}
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
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-mono focus:border-slate-400 focus:outline-none"
          />
          <p className="mt-1 text-[10px] text-slate-500">
            Header kolon adları otomatik algılanır: name, phone, whatsapp, email, city, district, address, website, category.
          </p>
        </div>
      </div>

      {error && (
        <p className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          {error}
        </p>
      )}

      <div className="flex justify-end pt-2">
        <Button onClick={handlePreview} disabled={pending || !name.trim() || (!pasteText && !csvText)}>
          <Upload className="h-4 w-4 mr-2" />
          {pending ? "Hazırlanıyor..." : "Önizle"}
        </Button>
      </div>
    </Card>
  );
}
