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
        className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-default)] bg-[var(--surface-2)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] transition hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]"
        title="Bu sayfa hakkında yardım"
      >
        <HelpCircle size={14} strokeWidth={1.5} className="text-[var(--text-muted)]" />
        Bu sayfa nedir?
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Drawer */}
      <aside
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-[var(--border-default)] bg-[var(--surface-1)] transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        aria-hidden={!open}
      >
        {/* Header */}
        <div className="flex flex-shrink-0 items-start justify-between gap-3 border-b border-[var(--border-default)] px-6 py-4">
          <div className="flex min-w-0 items-start gap-2.5">
            <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-[var(--info-border)] bg-[var(--info-dim)] text-[var(--info)]">
              <HelpCircle size={14} strokeWidth={1.5} />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
                Yardım
              </p>
              <h2 className="mt-0.5 text-sm font-semibold text-[var(--text-primary)]">
                {help.title}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex-shrink-0 rounded-md p-1 text-[var(--text-muted)] transition hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]"
            title="Kapat (Esc)"
          >
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>

        {/* Body — scroll */}
        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {/* Amaç */}
          <section>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
              Amaç
            </p>
            <p className="mt-2 text-sm leading-relaxed text-[var(--text-primary)]">
              {help.purpose}
            </p>
          </section>

          {/* Alanlar */}
          {help.fields && help.fields.length > 0 && (
            <section>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
                Önemli alanlar
              </p>
              <dl className="mt-2 space-y-3">
                {help.fields.map((f, i) => (
                  <div key={i} className="border-l-2 border-[var(--border-default)] pl-3">
                    <dt className="font-mono text-xs font-semibold text-[var(--text-primary)]">
                      {f.label}
                    </dt>
                    <dd className="mt-0.5 text-xs leading-relaxed text-[var(--text-secondary)]">
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
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
                Sıkça yapılan işler
              </p>
              <div className="mt-2 space-y-3">
                {help.tasks.map((t, i) => (
                  <div
                    key={i}
                    className="rounded-md border border-[var(--border-default)] bg-[var(--surface-2)] px-3 py-2.5"
                  >
                    <p className="text-xs font-semibold text-[var(--text-primary)]">
                      {t.title}
                    </p>
                    <ol className="mt-1.5 space-y-1 text-xs text-[var(--text-secondary)]">
                      {t.steps.map((step, si) => (
                        <li key={si} className="flex gap-2">
                          <span className="flex-shrink-0 font-mono tabular-nums text-[var(--text-muted)]">
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
          <section className="rounded-md border border-[var(--info-border)] bg-[var(--info-dim)] p-3">
            <Link
              href="/yardim/glosari"
              className="flex items-center justify-between gap-2 text-xs text-[var(--info)] transition hover:text-[var(--text-primary)]"
              onClick={() => setOpen(false)}
            >
              <span className="flex items-center gap-2">
                <BookOpen size={14} strokeWidth={1.5} />
                <span className="font-medium">
                  Glosari & Terimler sayfası
                  {help.relatedTerms && help.relatedTerms.length > 0 && (
                    <span className="block text-[11px] text-[var(--text-secondary)]">
                      Bu sayfa ile ilgili: {help.relatedTerms.join(", ")}
                    </span>
                  )}
                </span>
              </span>
              <ChevronRight size={14} strokeWidth={1.5} className="flex-shrink-0" />
            </Link>
          </section>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 border-t border-[var(--border-default)] bg-[var(--surface-2)] px-6 py-3 text-center text-[11px] text-[var(--text-muted)]">
          Bir terim eksik mi? Yöneticiye söyle, glosariye eklenir.
        </div>
      </aside>
    </>
  );
}
