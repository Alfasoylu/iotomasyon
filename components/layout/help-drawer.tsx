"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { HelpCircle, X, BookOpen, ChevronRight } from "lucide-react";

import type { PageHelp } from "@/lib/help-content";

interface HelpDrawerProps {
  help: PageHelp;
}

/**
 * Sağ kenardan açılan yardım paneli.
 *
 * "Bu sayfa nedir?" butonuna basılınca açılır. İçerik server-side'da
 * lib/help-content.ts'ten geçirilir, bu istemci bileşeni state'i yönetir.
 *
 * Klavye desteği: Escape kapatır.
 * Erişilebilirlik: backdrop tıklanırsa kapanır, focus trap drawer içinde.
 */
export function HelpDrawer({ help }: HelpDrawerProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onEsc);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onEsc);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      {/* Trigger button (sağ-üst) */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
        title="Bu sayfa hakkında yardım"
      >
        <HelpCircle className="h-3.5 w-3.5 text-slate-500" />
        Bu sayfa nedir?
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm transition-opacity"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Drawer */}
      <aside
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-white shadow-2xl transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        aria-hidden={!open}
      >
        {/* Header */}
        <div className="flex flex-shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-6 py-4">
          <div className="flex items-start gap-2.5 min-w-0">
            <div className="flex-shrink-0 mt-0.5 flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100">
              <HelpCircle className="h-4 w-4 text-blue-700" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-widest text-slate-400">
                Yardım
              </p>
              <h2 className="mt-0.5 text-sm font-semibold text-slate-900">
                {help.title}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex-shrink-0 rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            title="Kapat (Esc)"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body — scroll */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Amaç */}
          <section>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              Amaç
            </p>
            <p className="mt-2 text-sm leading-relaxed text-slate-700">
              {help.purpose}
            </p>
          </section>

          {/* Alanlar */}
          {help.fields && help.fields.length > 0 && (
            <section>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                Önemli alanlar
              </p>
              <dl className="mt-2 space-y-3">
                {help.fields.map((f, i) => (
                  <div key={i} className="border-l-2 border-slate-200 pl-3">
                    <dt className="font-mono text-xs font-semibold text-slate-800">
                      {f.label}
                    </dt>
                    <dd className="mt-0.5 text-xs leading-relaxed text-slate-600">
                      {f.desc}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {/* Tipik işler */}
          {help.tasks && help.tasks.length > 0 && (
            <section>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                Sıkça yapılan işler
              </p>
              <div className="mt-2 space-y-3">
                {help.tasks.map((t, i) => (
                  <div
                    key={i}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5"
                  >
                    <p className="text-xs font-semibold text-slate-800">
                      {t.title}
                    </p>
                    <ol className="mt-1.5 space-y-1 text-xs text-slate-600">
                      {t.steps.map((step, si) => (
                        <li key={si} className="flex gap-2">
                          <span className="flex-shrink-0 text-slate-400">
                            {si + 1}.
                          </span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Glosari linki */}
          <section className="rounded-lg border border-blue-200 bg-blue-50 p-3">
            <Link
              href="/yardim/glosari"
              className="flex items-center justify-between gap-2 text-xs text-blue-900 hover:text-blue-700"
              onClick={() => setOpen(false)}
            >
              <span className="flex items-center gap-2">
                <BookOpen className="h-3.5 w-3.5" />
                <span className="font-medium">
                  Glosari & Terimler sayfası
                  {help.relatedTerms && help.relatedTerms.length > 0 && (
                    <span className="block text-[10px] text-blue-700/80">
                      Bu sayfa ile ilgili: {help.relatedTerms.join(", ")}
                    </span>
                  )}
                </span>
              </span>
              <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" />
            </Link>
          </section>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 border-t border-slate-200 bg-slate-50 px-6 py-3 text-[10px] text-slate-500 text-center">
          Bir terim eksik mi? Yöneticiye söyle, glosariye eklenir.
        </div>
      </aside>
    </>
  );
}
