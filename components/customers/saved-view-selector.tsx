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
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50"
      >
        <Bookmark className="h-3.5 w-3.5" />
        Görünüm{views.length > 0 ? ` (${views.length})` : ""}
        <ChevronDown className="h-3 w-3 text-slate-400" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 w-72 rounded-lg border border-slate-200 bg-white shadow-lg overflow-hidden">
          <div className="border-b border-slate-100 bg-slate-50 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              Kayıtlı Görünümler
            </p>
          </div>

          {views.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-slate-400">
              Henüz kayıtlı görünüm yok.
            </p>
          ) : (
            <ul className="max-h-64 overflow-y-auto">
              {views.map((view) => (
                <li key={view.id} className="border-b border-slate-50 last:border-0">
                  <div className="flex items-center justify-between gap-2 px-3 py-2 group hover:bg-slate-50">
                    <button
                      type="button"
                      onClick={() => loadView(view)}
                      className="flex-1 text-left min-w-0"
                    >
                      <p className="text-xs font-medium text-slate-900 truncate">
                        {view.name}
                      </p>
                      <div className="mt-0.5 flex items-center gap-2">
                        {view.isShared && (
                          <span className="inline-flex items-center gap-0.5 text-[9px] text-slate-500">
                            <Share2 className="h-2.5 w-2.5" />
                            paylaşılan
                          </span>
                        )}
                      </div>
                    </button>
                    {view.userId === currentUserId && (
                      <button
                        type="button"
                        onClick={() => deleteView(view.id)}
                        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-600 transition"
                        title="Sil"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="border-t border-slate-100 bg-slate-50 px-3 py-2">
            {!saving ? (
              <button
                type="button"
                onClick={() => setSaving(true)}
                disabled={!hasActiveFilters}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Plus className="h-3 w-3" />
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
                  className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs"
                />
                <label className="flex items-center gap-1.5 text-[10px] text-slate-600">
                  <input
                    type="checkbox"
                    checked={shareWithTeam}
                    onChange={(e) => setShareWithTeam(e.target.checked)}
                    className="h-3 w-3"
                  />
                  Ekiple paylaş
                </label>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={saveCurrent}
                    disabled={pending || !newName.trim()}
                    className="flex-1 rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {pending ? "Kaydediliyor…" : "Kaydet"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setSaving(false); setNewName(""); }}
                    className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                  >
                    <X className="h-3 w-3" />
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
