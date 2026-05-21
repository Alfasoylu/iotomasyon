"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Bookmark, ChevronDown, Trash2, Plus, Share2, X } from "lucide-react";

import {
  createSavedViewAction,
  deleteSavedViewAction,
} from "@/lib/actions/saved-view-actions";

interface SavedView {
  id: string;
  name: string;
  filtersJson: string;
  isShared: boolean;
  userId: string;
}

interface Props {
  views: SavedView[];
  currentUserId: string;
  resource: string;       // "customers"
}

/**
 * Kayıtlı görünüm dropdown'u.
 * - Aktif filtreyi "Bu görünümü kaydet" ile kaydeder
 * - Kayıtlı görünüme tıklayınca URL params yüklenir
 */
export function SavedViewSelector({ views, currentUserId, resource }: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState("");
  const [shareWithTeam, setShareWithTeam] = useState(false);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSaving(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  // Aktif filtreyi al
  const currentFilters = (() => {
    const params: Record<string, string> = {};
    sp.forEach((value, key) => {
      params[key] = value;
    });
    return params;
  })();
  const hasActiveFilters = Object.keys(currentFilters).length > 0;

  function loadView(view: SavedView) {
    try {
      const filters = JSON.parse(view.filtersJson) as Record<string, string>;
      const newParams = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => {
        if (v && v !== "all") newParams.set(k, v);
      });
      router.push(`/${resource}?${newParams.toString()}`);
      setOpen(false);
    } catch {
      router.push(`/${resource}`);
    }
  }

  function saveCurrent() {
    if (!newName.trim()) return;
    startTransition(async () => {
      const result = await createSavedViewAction({
        name: newName.trim(),
        resource,
        filtersJson: JSON.stringify(currentFilters),
        isShared: shareWithTeam,
      });
      if (result.ok) {
        setNewName("");
        setShareWithTeam(false);
        setSaving(false);
        router.refresh();
      }
    });
  }

  function deleteView(id: string) {
    if (!confirm("Bu görünümü silmek istediğine emin misin?")) return;
    startTransition(async () => {
      await deleteSavedViewAction(id);
      router.refresh();
    });
  }

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
      >
        <Bookmark size={14} strokeWidth={1.5} />
        Görünüm{views.length > 0 ? ` (${views.length})` : ""}
        <ChevronDown size={14} strokeWidth={1.5} className="text-[var(--text-muted)]" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 w-72 overflow-hidden rounded-lg border border-[var(--border-default)] bg-[var(--surface-2)]">
          <div className="border-b border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
              Kayıtlı Görünümler
            </p>
          </div>

          {views.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-[var(--text-muted)]">
              Henüz kayıtlı görünüm yok.
            </p>
          ) : (
            <ul className="max-h-64 overflow-y-auto">
              {views.map((view) => (
                <li key={view.id} className="border-b border-[var(--border-subtle)] last:border-0">
                  <div className="flex items-center justify-between gap-2 px-3 py-2 group hover:bg-[var(--surface-3)]">
                    <button
                      type="button"
                      onClick={() => loadView(view)}
                      className="flex-1 text-left min-w-0"
                    >
                      <p className="text-xs font-medium text-[var(--text-primary)] truncate">
                        {view.name}
                      </p>
                      <div className="mt-0.5 flex items-center gap-2">
                        {view.isShared && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-[var(--text-muted)]">
                            <Share2 size={14} strokeWidth={1.5} />
                            paylaşılan
                          </span>
                        )}
                      </div>
                    </button>
                    {view.userId === currentUserId && (
                      <button
                        type="button"
                        onClick={() => deleteView(view.id)}
                        className="opacity-0 group-hover:opacity-100 text-[var(--text-muted)] hover:text-[var(--danger)] transition"
                        title="Sil"
                      >
                        <Trash2 size={14} strokeWidth={1.5} />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="border-t border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 py-2">
            {!saving ? (
              <button
                type="button"
                onClick={() => setSaving(true)}
                disabled={!hasActiveFilters}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[var(--accent-fg)] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Plus size={14} strokeWidth={1.5} />
                {hasActiveFilters ? "Bu filtreyi kaydet" : "Önce filtre uygula"}
              </button>
            ) : (
              <div className="space-y-2">
                <input
                  type="text"
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="örn. Mersin'deki ticariler"
                  className="h-9 w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] px-2 text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent-border)]"
                />
                <label className="flex items-center gap-1.5 text-[10px] text-[var(--text-secondary)]">
                  <input
                    type="checkbox"
                    checked={shareWithTeam}
                    onChange={(e) => setShareWithTeam(e.target.checked)}
                    className="h-3 w-3 accent-[var(--accent)]"
                  />
                  Ekiple paylaş
                </label>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={saveCurrent}
                    disabled={pending || !newName.trim()}
                    className="flex-1 rounded-md bg-[var(--accent)] px-2 py-1 text-xs font-semibold text-[var(--accent-fg)] hover:opacity-90 disabled:opacity-50"
                  >
                    {pending ? "Kaydediliyor…" : "Kaydet"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setSaving(false); setNewName(""); }}
                    className="rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] px-2 py-1 text-xs text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
                  >
                    <X size={14} strokeWidth={1.5} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
