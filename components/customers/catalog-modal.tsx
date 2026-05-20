"use client";

import { useState, useTransition } from "react";
import { Sparkles, X, FileDown, MessageCircle, ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { recordCatalogSentAction } from "@/lib/actions/catalog-actions";

export type CatalogModalProfile = {
  slug: string;
  title: string;
  subtitle: string;
  defaultPriceMode: "wholesale" | "retail" | "hidden";
};

export interface CatalogModalProps {
  customerId: string;
  customerName: string;
  customerCompany: string | null;
  customerPhone: string | null;
  customerWhatsapp: string | null;
  customerIndustrySlug: string | null;
  profiles: CatalogModalProfile[];
  canWholesale: boolean;
  brands: string[];
  defaultProfileSlug: string;
}

export function CatalogModal({
  customerId,
  customerName,
  customerCompany,
  customerPhone,
  customerWhatsapp,
  customerIndustrySlug,
  profiles,
  canWholesale,
  brands,
  defaultProfileSlug,
}: CatalogModalProps) {
  const [open, setOpen] = useState(false);
  const [profileSlug, setProfileSlug] = useState<string>(defaultProfileSlug);
  const [priceMode, setPriceMode] = useState<"wholesale" | "retail" | "hidden">(
    () => {
      const initial = profiles.find((p) => p.slug === defaultProfileSlug)?.defaultPriceMode;
      if (initial === "wholesale" && !canWholesale) return "retail";
      return initial ?? "retail";
    },
  );
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [onlyStock, setOnlyStock] = useState(true);
  const [coverNote, setCoverNote] = useState("");
  const [busy, startTransition] = useTransition();

  function buildPdfUrl() {
    const params = new URLSearchParams();
    params.set("profile", profileSlug);
    params.set("priceMode", priceMode);
    params.set("onlyStock", onlyStock ? "1" : "0");
    if (selectedBrands.length > 0) params.set("brand", selectedBrands.join(","));
    if (coverNote.trim().length > 0) params.set("coverNote", coverNote.trim());
    return `/api/catalogs/${customerId}/pdf?${params.toString()}`;
  }

  function logCatalogEvent(channel: "WHATSAPP" | "EMAIL" | "DOWNLOAD") {
    const profile = profiles.find((p) => p.slug === profileSlug);
    startTransition(async () => {
      await recordCatalogSentAction({
        customerId,
        profileSlug,
        profileTitle: profile?.title ?? profileSlug,
        priceMode,
        coverNote: coverNote.trim() || null,
        productCount: 0, // estimated client-side; not critical
        channel,
      });
    });
  }

  function onDownload() {
    const url = buildPdfUrl();
    logCatalogEvent("DOWNLOAD");
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function createShareLink(): Promise<string | null> {
    try {
      const res = await fetch("/api/catalogs/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          profileSlug,
          priceMode,
          brandFilter: selectedBrands,
          onlyStock,
          coverNote: coverNote.trim() || null,
        }),
      });
      if (!res.ok) {
        alert("Paylaşım linki oluşturulamadı.");
        return null;
      }
      const data = await res.json();
      return data.url as string;
    } catch {
      alert("Bağlantı hatası, paylaşım linki oluşturulamadı.");
      return null;
    }
  }

  async function onWhatsApp() {
    const phone = (customerWhatsapp ?? customerPhone)?.replace(/\D/g, "") ?? "";
    if (!phone) {
      alert("Müşterinin telefon numarası yok.");
      return;
    }
    const shareUrl = await createShareLink();
    if (!shareUrl) return;
    const profile = profiles.find((p) => p.slug === profileSlug);
    const fullShare = `${window.location.origin}${shareUrl}`;
    const msg =
      `Merhaba ${customerName},\n\n` +
      `Sizin için hazırladığımız ${profile?.title ?? "ürün kataloğumuzu"} aşağıdaki linkten inceleyebilirsiniz:\n\n` +
      `${fullShare}\n\n` +
      `Sorularınız için 0850 307 7397'den ulaşabilirsiniz.\n\nAlfa Soylu Elektronik`;
    const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
    logCatalogEvent("WHATSAPP");
    window.open(waUrl, "_blank", "noopener,noreferrer");
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center gap-2 rounded-xl bg-amber-500 px-4 text-sm font-semibold text-white transition hover:bg-amber-600"
      >
        <Sparkles className="h-4 w-4" />
        Katalog Gönder
      </button>
    );
  }

  const currentProfile = profiles.find((p) => p.slug === profileSlug);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center gap-2 rounded-xl bg-amber-500 px-4 text-sm font-semibold text-white transition hover:bg-amber-600"
      >
        <Sparkles className="h-4 w-4" />
        Katalog Gönder
      </button>

      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
        onClick={() => setOpen(false)}
      >
        <div
          className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Sektör Odaklı Katalog Gönder</h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-[10px] uppercase tracking-widest text-slate-500 mb-1">
                Sektör Profili
              </label>
              <select
                value={profileSlug}
                onChange={(e) => {
                  setProfileSlug(e.target.value);
                  const p = profiles.find((x) => x.slug === e.target.value);
                  if (p) {
                    const desired = p.defaultPriceMode;
                    setPriceMode(desired === "wholesale" && !canWholesale ? "retail" : desired);
                  }
                }}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
              >
                {profiles.map((p) => (
                  <option key={p.slug} value={p.slug}>
                    {p.title}
                    {customerIndustrySlug === p.slug ? "  (müşteri sektörü)" : ""}
                  </option>
                ))}
              </select>
              {currentProfile && (
                <p className="mt-1 text-[11px] text-slate-500">{currentProfile.subtitle}</p>
              )}
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-widest text-slate-500 mb-1">
                Fiyat Modu
              </label>
              <div className="flex flex-wrap gap-2">
                <PriceModeButton
                  active={priceMode === "retail"}
                  onClick={() => setPriceMode("retail")}
                  label="Perakende (USD)"
                  description="Son müşteri fiyatları"
                />
                <PriceModeButton
                  active={priceMode === "wholesale"}
                  onClick={() => canWholesale && setPriceMode("wholesale")}
                  disabled={!canWholesale}
                  label="Bayi (USD)"
                  description={canWholesale ? "Toptan fiyatlar" : "Sadece ADMIN"}
                />
                <PriceModeButton
                  active={priceMode === "hidden"}
                  onClick={() => setPriceMode("hidden")}
                  label="Fiyatsız"
                  description="Sadece ürün listesi"
                />
              </div>
              {priceMode !== "hidden" && (
                <p className="mt-1 text-[11px] text-slate-500">
                  Tüm fiyatlar USD bazında ve <strong>KDV hariçtir</strong>. Faturada TCMB kuru uygulanır.
                </p>
              )}
            </div>

            {brands.length > 0 && (
              <BrandPicker
                brands={brands}
                selected={selectedBrands}
                onChange={setSelectedBrands}
              />
            )}

            <div>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={onlyStock}
                  onChange={(e) => setOnlyStock(e.target.checked)}
                />
                Sadece stoktaki ürünler
              </label>
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-widest text-slate-500 mb-1">
                Ön Söz (opsiyonel, max 500 karakter)
              </label>
              <Textarea
                value={coverNote}
                onChange={(e) => setCoverNote(e.target.value.slice(0, 500))}
                placeholder={`Ahmet bey, dün konuşmamızın ardından özel kataloğumuzu hazırladık. AHD ürünlerinde özel marjlarımız var…`}
                rows={3}
              />
              <p className="mt-1 text-[10px] text-slate-400">
                {coverNote.length} / 500
              </p>
            </div>

            <div className="border-t border-slate-100 pt-4">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="primary"
                  onClick={onWhatsApp}
                  disabled={busy || (!customerWhatsapp && !customerPhone)}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  <MessageCircle className="h-4 w-4 mr-2" />
                  WhatsApp ile Paylaş
                </Button>
                <Button variant="secondary" onClick={onDownload} disabled={busy}>
                  <FileDown className="h-4 w-4 mr-2" />
                  PDF İndir / Önizle
                </Button>
                <Button variant="ghost" onClick={() => setOpen(false)}>
                  Vazgeç
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function PriceModeButton({
  active,
  disabled,
  onClick,
  label,
  description,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  label: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex-1 min-w-[140px] rounded-xl border-2 px-3 py-2 text-left transition ${
        active
          ? "border-amber-500 bg-amber-50 text-amber-900"
          : disabled
            ? "border-slate-100 bg-slate-50 text-slate-300 cursor-not-allowed"
            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
      }`}
    >
      <p className="text-sm font-semibold">{label}</p>
      <p className="text-[10px] mt-0.5">{description}</p>
    </button>
  );
}

function BrandPicker({
  brands,
  selected,
  onChange,
}: {
  brands: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  function toggle(brand: string) {
    if (selected.includes(brand)) {
      onChange(selected.filter((b) => b !== brand));
    } else {
      onChange([...selected, brand]);
    }
  }
  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((x) => !x)}
        className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
      >
        <span className="text-slate-700">
          Marka filtresi
          {selected.length > 0 && (
            <span className="ml-2 text-amber-700">({selected.length} seçili)</span>
          )}
        </span>
        <ChevronDown className={`h-4 w-4 text-slate-400 transition ${expanded ? "rotate-180" : ""}`} />
      </button>
      {expanded && (
        <div className="mt-2 max-h-40 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50 p-2">
          {brands.map((b) => (
            <label
              key={b}
              className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-white"
            >
              <input
                type="checkbox"
                checked={selected.includes(b)}
                onChange={() => toggle(b)}
              />
              {b}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
