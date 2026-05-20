"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search, X, Users, FileText, Package, ArrowRight, Loader2,
  Heart, ShoppingCart, Ship, DollarSign, Plus, BookOpen,
  type LucideIcon,
} from "lucide-react";

type Resource = "customer" | "quote" | "product";

interface ApiResult {
  id: string;
  resource: Resource;
  title: string;
  subtitle: string | null;
  href: string;
  metaHint: string | null;
}

interface ActionResult {
  id: string;
  kind: "action";
  title: string;
  hint: string;
  href: string;
  icon: LucideIcon;
}

type Item = (ApiResult & { kind: "search" }) | ActionResult;

const ACTIONS: ActionResult[] = [
  { id: "a-customer-new", kind: "action", title: "Yeni Müşteri", hint: "kayıt aç", href: "/customers/new", icon: Plus },
  { id: "a-quote-new", kind: "action", title: "Yeni Teklif", hint: "boş teklif oluştur", href: "/quotes", icon: FileText },
  { id: "a-product-new", kind: "action", title: "Yeni Ürün", hint: "kataloğa ekle", href: "/products/new", icon: Package },
  { id: "a-customers", kind: "action", title: "Müşteri Listesi", hint: "tüm müşteriler", href: "/customers", icon: Users },
  { id: "a-products", kind: "action", title: "Ürün Listesi", hint: "katalog", href: "/products", icon: Package },
  { id: "a-marketplace", kind: "action", title: "Pazaryerleri", hint: "14 kanal performansı", href: "/marketplace", icon: ShoppingCart },
  { id: "a-sermaye", kind: "action", title: "Sermaye Sağlığı", hint: "günlük karar panosu", href: "/admin/sermaye-saglik", icon: Heart },
  { id: "a-import", kind: "action", title: "Karar Kokpiti", hint: "ithalat kararı", href: "/admin/import-cockpit", icon: Ship },
  { id: "a-capital", kind: "action", title: "Sermaye Dağılımı", hint: "yatırım önerisi", href: "/admin/capital", icon: DollarSign },
  { id: "a-glosari", kind: "action", title: "Glosari", hint: "terimler sözlüğü", href: "/yardim/glosari", icon: BookOpen },
];

const RESOURCE_LABELS: Record<Resource, string> = {
  customer: "Müşteri",
  quote: "Teklif",
  product: "Ürün",
};

const RESOURCE_ICONS: Record<Resource, LucideIcon> = {
  customer: Users,
  quote: FileText,
  product: Package,
};

/**
 * ⌘K Komut Paleti — global search + aksiyon listesi
 *
 * Klavye:
 *   ⌘K / Ctrl+K → aç
 *   Escape       → kapat
 *   ↑/↓         → sonuçlar arası gezinti
 *   Enter        → açılan satıra git
 */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ApiResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Global keyboard shortcut
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Focus input when open
  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
      setQuery("");
      setResults([]);
      setSelectedIdx(0);
    }
  }, [open]);

  // Search debounce
  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/command-palette?q=${encodeURIComponent(query)}`);
        if (res.ok) {
          const data = await res.json();
          setResults(data.results ?? []);
          setSelectedIdx(0);
        }
      } catch {
        setResults([]);
      }
      setLoading(false);
    }, 200);
    return () => clearTimeout(timer);
  }, [query, open]);

  // Items: search results + filtered actions
  const items: Item[] = (() => {
    const q = query.trim().toLowerCase();
    const searchItems: Item[] = results.map((r) => ({ ...r, kind: "search" as const }));

    if (q.length === 0) {
      return ACTIONS.map((a) => ({ ...a, kind: "action" as const }));
    }
    const filteredActions = ACTIONS.filter(
      (a) => a.title.toLowerCase().includes(q) || a.hint.toLowerCase().includes(q),
    ).map((a) => ({ ...a, kind: "action" as const }));
    return [...searchItems, ...filteredActions];
  })();

  function handleSelect(item: Item) {
    setOpen(false);
    router.push(item.href);
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(items.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = items[selectedIdx];
      if (item) handleSelect(item);
    }
  }

  return (
    <>
      {/* Trigger button (header'da gösterilebilir) */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden md:inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-500 hover:border-slate-300 hover:text-slate-700 transition"
        title="Global ara (⌘K)"
      >
        <Search className="h-3.5 w-3.5" />
        <span>Ara…</span>
        <kbd className="ml-2 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-mono">⌘K</kbd>
      </button>

      {/* Modal */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] bg-slate-950/40 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-xl rounded-2xl bg-white shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Search input */}
            <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
              <Search className="h-4 w-4 text-slate-400 flex-shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Müşteri / teklif / ürün ara veya aksiyon seç…"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
              />
              {loading && <Loader2 className="h-4 w-4 text-slate-400 animate-spin flex-shrink-0" />}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100"
                title="Kapat (Esc)"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Results */}
            <div className="max-h-[60vh] overflow-y-auto">
              {items.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-slate-400">
                  {query.length < 2 ? "En az 2 karakter yaz" : "Sonuç bulunamadı"}
                </p>
              ) : (
                <ul className="py-2">
                  {items.map((item, idx) => {
                    const isSelected = idx === selectedIdx;
                    const Icon = item.kind === "action"
                      ? item.icon
                      : RESOURCE_ICONS[item.resource];
                    const label = item.kind === "action"
                      ? "Aksiyon"
                      : RESOURCE_LABELS[item.resource];

                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => handleSelect(item)}
                          onMouseEnter={() => setSelectedIdx(idx)}
                          className={`flex w-full items-start gap-3 px-4 py-2.5 text-left transition ${
                            isSelected ? "bg-slate-100" : "hover:bg-slate-50"
                          }`}
                        >
                          <div className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg ${
                            item.kind === "action" ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-700"
                          }`}>
                            <Icon className="h-3.5 w-3.5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-slate-900 truncate">{item.title}</span>
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-slate-500">
                                {label}
                              </span>
                            </div>
                            {item.kind === "search" && item.subtitle && (
                              <p className="text-xs text-slate-500 truncate">{item.subtitle}</p>
                            )}
                            {item.kind === "search" && item.metaHint && (
                              <p className="text-[11px] text-slate-400 truncate">{item.metaHint}</p>
                            )}
                            {item.kind === "action" && (
                              <p className="text-xs text-slate-500">{item.hint}</p>
                            )}
                          </div>
                          {isSelected && <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 text-slate-400 mt-1" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Footer hint */}
            <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-4 py-2 text-[10px] text-slate-400">
              <span className="flex items-center gap-1.5">
                <kbd className="rounded bg-white border border-slate-200 px-1.5 py-0.5 font-mono">↑↓</kbd>
                gezinti
              </span>
              <span className="flex items-center gap-1.5">
                <kbd className="rounded bg-white border border-slate-200 px-1.5 py-0.5 font-mono">Enter</kbd>
                seç
              </span>
              <span className="flex items-center gap-1.5">
                <kbd className="rounded bg-white border border-slate-200 px-1.5 py-0.5 font-mono">Esc</kbd>
                kapat
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
