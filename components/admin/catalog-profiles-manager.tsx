"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ChevronRight, Save, Trash2, Plus, ArrowUp, ArrowDown, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  upsertCatalogProfileAction,
  deleteCatalogProfileAction,
  type CatalogProfileInput,
} from "@/lib/actions/catalog-profile-actions";

type Category = { slug: string; name: string; productCount: number };
type Industry = { slug: string; name: string; customerCount: number };
type Profile = CatalogProfileInput;

interface Props {
  profiles: Profile[];
  categories: Category[];
  industries: Industry[];
}

export function CatalogProfilesManager({ profiles: initialProfiles, categories, industries }: Props) {
  const [profiles, setProfiles] = useState(initialProfiles);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  function profileForIndustry(slug: string): Profile | undefined {
    return profiles.find((p) => p.slug === slug);
  }

  // Sektörler için profil var mı yok mu özet
  const industryCoverage = industries.map((i) => ({
    industry: i,
    profile: profileForIndustry(i.slug),
  }));
  const uncovered = industryCoverage.filter((c) => !c.profile && i_haveCustomers(c.industry));

  function i_haveCustomers(i: Industry): boolean {
    return i.customerCount > 0;
  }

  return (
    <div className="space-y-6">
      {/* Endüstri kapsama özeti */}
      <div className="rounded-md border border-[var(--border-default)] bg-[var(--surface-2)] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[13px] font-medium text-[var(--text-primary)]">
              Endüstri kapsama
            </h3>
            <p className="mt-1 text-[12px] text-[var(--text-muted)]">
              {industries.length} endüstri var, {profiles.length} katalog profili tanımlı.
              {uncovered.length > 0 ? (
                <span className="text-[var(--warn)]">
                  {" "}
                  <strong>{uncovered.length}</strong> endüstri için profil yok — bu müşterilere GENERAL katalog gider.
                </span>
              ) : (
                <span className="text-[var(--ok)]"> Müşterili tüm endüstrilerin profili var.</span>
              )}
            </p>
          </div>
        </div>
        {uncovered.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {uncovered.map((c) => (
              <span
                key={c.industry.slug}
                className="inline-flex items-center gap-1.5 rounded bg-[var(--surface-3)] px-2 py-1 text-[11px] text-[var(--text-secondary)]"
              >
                {c.industry.name}
                <span className="text-[10px] tabular-nums text-[var(--text-muted)]">
                  {c.industry.customerCount} müşteri
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const newProfile: Profile = {
                      slug: c.industry.slug,
                      title: `${c.industry.name} için Katalog`,
                      subtitle: "—",
                      categorySlugs: [],
                      defaultPriceMode: "wholesale",
                      enabled: true,
                      sortOrder: 100,
                    };
                    setProfiles((arr) => [...arr, newProfile]);
                    setExpanded(c.industry.slug);
                  }}
                  className="rounded bg-[var(--accent-dim)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--accent)] hover:bg-[var(--accent)] hover:text-black"
                >
                  + Oluştur
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Profile listesi */}
      <div className="space-y-2">
        {profiles
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((p) => (
            <ProfileRow
              key={p.slug}
              profile={p}
              categories={categories}
              expanded={expanded === p.slug}
              onToggle={() => setExpanded(expanded === p.slug ? null : p.slug)}
              onUpdate={(updated) => {
                setProfiles((arr) => arr.map((x) => (x.slug === updated.slug ? updated : x)));
              }}
              onDelete={() => {
                setProfiles((arr) => arr.filter((x) => x.slug !== p.slug));
              }}
            />
          ))}
      </div>

      {/* Yeni profil oluştur */}
      {!creating ? (
        <Button variant="secondary" onClick={() => setCreating(true)}>
          <Plus size={14} strokeWidth={1.5} />
          Yeni profil
        </Button>
      ) : (
        <NewProfileForm
          categories={categories}
          industries={industries.filter((i) => !profileForIndustry(i.slug))}
          onCancel={() => setCreating(false)}
          onCreated={(p) => {
            setProfiles((arr) => [...arr, p]);
            setCreating(false);
            setExpanded(p.slug);
          }}
        />
      )}
    </div>
  );
}

function ProfileRow({
  profile,
  categories,
  expanded,
  onToggle,
  onUpdate,
  onDelete,
}: {
  profile: Profile;
  categories: Category[];
  expanded: boolean;
  onToggle: () => void;
  onUpdate: (p: Profile) => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-md border border-[var(--border-default)] bg-[var(--surface-2)] overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-[var(--surface-3)]"
      >
        {expanded ? (
          <ChevronDown size={14} strokeWidth={1.5} className="text-[var(--text-muted)]" />
        ) : (
          <ChevronRight size={14} strokeWidth={1.5} className="text-[var(--text-muted)]" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-[var(--text-muted)]">
              {profile.slug}
            </span>
            <span className="text-[13px] font-medium text-[var(--text-primary)] truncate">
              {profile.title}
            </span>
            {!profile.enabled && <Badge variant="warn">Devre dışı</Badge>}
            <Badge variant={profile.defaultPriceMode === "wholesale" ? "ok" : profile.defaultPriceMode === "retail" ? "info" : "warn"}>
              {profile.defaultPriceMode === "wholesale" ? "Bayi" : profile.defaultPriceMode === "retail" ? "Perakende" : "Gizli"}
            </Badge>
          </div>
          <p className="mt-0.5 text-[11px] text-[var(--text-muted)] truncate">
            {profile.categorySlugs.length} kategori · {profile.subtitle}
          </p>
        </div>
      </button>
      {expanded && (
        <div className="border-t border-[var(--border-subtle)] bg-[var(--surface-1)] p-4">
          <ProfileEditor profile={profile} categories={categories} onUpdate={onUpdate} onDelete={onDelete} />
        </div>
      )}
    </div>
  );
}

function ProfileEditor({
  profile,
  categories,
  onUpdate,
  onDelete,
}: {
  profile: Profile;
  categories: Category[];
  onUpdate: (p: Profile) => void;
  onDelete: () => void;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Profile>(profile);
  const [pending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggleCategory(slug: string) {
    setValues((v) => ({
      ...v,
      categorySlugs: v.categorySlugs.includes(slug)
        ? v.categorySlugs.filter((s) => s !== slug)
        : [...v.categorySlugs, slug],
    }));
  }

  function moveCategory(index: number, dir: -1 | 1) {
    setValues((v) => {
      const arr = [...v.categorySlugs];
      const target = index + dir;
      if (target < 0 || target >= arr.length) return v;
      [arr[index], arr[target]] = [arr[target], arr[index]];
      return { ...v, categorySlugs: arr };
    });
  }

  function removeCategory(slug: string) {
    setValues((v) => ({
      ...v,
      categorySlugs: v.categorySlugs.filter((s) => s !== slug),
    }));
  }

  // Map for quick lookup
  const categoryMap = new Map(categories.map((c) => [c.slug, c]));
  const selectedCategories = values.categorySlugs
    .map((s) => categoryMap.get(s))
    .filter((c): c is Category => !!c);
  const availableCategories = categories.filter(
    (c) => !values.categorySlugs.includes(c.slug),
  );

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await upsertCatalogProfileAction(values);
      if (res.ok) {
        setSavedAt(Date.now());
        onUpdate(values);
        router.refresh();
        setTimeout(() => setSavedAt(null), 2500);
      } else {
        setError(res.message ?? "Kaydedilemedi");
      }
    });
  }

  function remove() {
    if (!confirm(`"${profile.title}" profilini silmek istediğinden emin misin?`)) return;
    startTransition(async () => {
      const res = await deleteCatalogProfileAction(profile.slug);
      if (res.ok) {
        onDelete();
        router.refresh();
      } else {
        setError(res.message ?? "Silinemedi");
      }
    });
  }

  const totalProducts = categories
    .filter((c) => values.categorySlugs.includes(c.slug))
    .reduce((s, c) => s + c.productCount, 0);

  const justSaved = savedAt && Date.now() - savedAt < 2500;

  return (
    <div className="space-y-4">
      {/* Başlık + altyazı */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
            Katalog Başlığı (PDF kapak)
          </label>
          <Input
            className="mt-1"
            value={values.title}
            onChange={(e) => setValues({ ...values, title: e.target.value })}
            disabled={pending}
          />
        </div>
        <div>
          <label className="block text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
            Alt Başlık
          </label>
          <Input
            className="mt-1"
            value={values.subtitle}
            onChange={(e) => setValues({ ...values, subtitle: e.target.value })}
            disabled={pending}
          />
        </div>
      </div>

      {/* Fiyat modu + sıra + enabled */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="block text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
            Varsayılan Fiyat Modu
          </label>
          <select
            className="mt-1 h-9 w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] px-2 text-[12px] text-[var(--text-primary)]"
            value={values.defaultPriceMode}
            onChange={(e) =>
              setValues({ ...values, defaultPriceMode: e.target.value as Profile["defaultPriceMode"] })
            }
            disabled={pending}
          >
            <option value="wholesale">Bayi (wholesale)</option>
            <option value="retail">Perakende (retail)</option>
            <option value="hidden">Fiyat gizli</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
            Sıra No (küçük önce)
          </label>
          <Input
            type="number"
            className="mt-1"
            value={values.sortOrder}
            onChange={(e) => setValues({ ...values, sortOrder: Number(e.target.value) || 0 })}
            disabled={pending}
          />
        </div>
        <div>
          <label className="block text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
            Durum
          </label>
          <label className="mt-1 inline-flex h-9 items-center gap-2 rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] px-3 text-[12px] text-[var(--text-primary)] cursor-pointer">
            <input
              type="checkbox"
              checked={values.enabled}
              onChange={(e) => setValues({ ...values, enabled: e.target.checked })}
              disabled={pending}
            />
            Aktif (kataloglarda kullanılır)
          </label>
        </div>
      </div>

      {/* Kategori yönetimi — iki panel: seçili (sıralı) + havuz */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* SOL: Seçili kategoriler — sırayla, ↑↓ butonlarıyla reorder */}
        <div>
          <div className="flex items-center justify-between">
            <label className="block text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
              KATALOGDA GÖRÜNECEKLER ({selectedCategories.length}) · katalogun başında ne çıksın istiyorsan üste taşı
            </label>
            <span className="text-[10px] tabular-nums text-[var(--text-muted)]">
              ~{totalProducts} ürün
            </span>
          </div>
          <div className="mt-2 max-h-[340px] overflow-y-auto rounded border border-[var(--accent-border)] bg-[var(--accent-dim)] p-2">
            {selectedCategories.length === 0 ? (
              <p className="py-8 text-center text-[11px] text-[var(--text-muted)]">
                Henüz kategori eklenmemiş. Sağdaki havuzdan ekle.
              </p>
            ) : (
              <div className="space-y-1">
                {selectedCategories.map((c, idx) => (
                  <div
                    key={c.slug}
                    className="flex items-center gap-1.5 rounded bg-[var(--surface-1)] px-2 py-1.5 text-[11.5px]"
                  >
                    <span className="flex-shrink-0 w-5 text-right font-mono text-[10px] text-[var(--text-muted)]">
                      {idx + 1}.
                    </span>
                    <span className="flex-1 truncate text-[var(--text-primary)]">{c.name}</span>
                    <span className="flex-shrink-0 font-mono text-[10px] text-[var(--text-muted)]">
                      {c.productCount}
                    </span>
                    <button
                      type="button"
                      disabled={pending || idx === 0}
                      onClick={() => moveCategory(idx, -1)}
                      className="flex-shrink-0 rounded p-0.5 text-[var(--text-muted)] transition hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)] disabled:opacity-30"
                      title="Yukarı taşı"
                    >
                      <ArrowUp size={11} strokeWidth={1.8} />
                    </button>
                    <button
                      type="button"
                      disabled={pending || idx === selectedCategories.length - 1}
                      onClick={() => moveCategory(idx, 1)}
                      className="flex-shrink-0 rounded p-0.5 text-[var(--text-muted)] transition hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)] disabled:opacity-30"
                      title="Aşağı taşı"
                    >
                      <ArrowDown size={11} strokeWidth={1.8} />
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => removeCategory(c.slug)}
                      className="flex-shrink-0 rounded p-0.5 text-[var(--text-muted)] transition hover:bg-[var(--danger)]/20 hover:text-[var(--danger)]"
                      title="Kaldır"
                    >
                      <X size={11} strokeWidth={1.8} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* SAĞ: Havuz — eklenmemiş kategoriler */}
        <div>
          <label className="block text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
            EKLENEBİLİR KATEGORİLER ({availableCategories.length}) · tıkla → seçili listeye eklenir (sona)
          </label>
          <div className="mt-2 max-h-[340px] overflow-y-auto rounded border border-[var(--border-subtle)] bg-[var(--surface-2)] p-2">
            {availableCategories.length === 0 ? (
              <p className="py-8 text-center text-[11px] text-[var(--text-muted)]">
                Tüm kategoriler eklendi.
              </p>
            ) : (
              <div className="space-y-0.5">
                {availableCategories.map((c) => (
                  <button
                    key={c.slug}
                    type="button"
                    disabled={pending}
                    onClick={() => toggleCategory(c.slug)}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[11.5px] text-[var(--text-secondary)] transition hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]"
                  >
                    <Plus size={11} strokeWidth={1.8} className="flex-shrink-0 text-[var(--text-muted)]" />
                    <span className="flex-1 truncate">{c.name}</span>
                    <span className="flex-shrink-0 font-mono text-[10px] text-[var(--text-muted)]">
                      {c.productCount}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Save / Delete buttons */}
      <div className="flex items-center justify-between border-t border-[var(--border-subtle)] pt-3">
        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={pending}>
            <Save size={14} strokeWidth={1.5} />
            {pending ? "Kaydediliyor…" : "Kaydet"}
          </Button>
          {justSaved && (
            <span className="inline-flex items-center gap-1 text-[12px] text-[var(--ok)]">
              <Check size={12} strokeWidth={1.5} /> Kaydedildi
            </span>
          )}
          {error && <span className="text-[12px] text-[var(--danger)]">{error}</span>}
        </div>
        {profile.slug !== "general" && (
          <Button variant="ghost" onClick={remove} disabled={pending}>
            <Trash2 size={14} strokeWidth={1.5} />
            Sil
          </Button>
        )}
      </div>
    </div>
  );
}

function NewProfileForm({
  categories,
  industries,
  onCancel,
  onCreated,
}: {
  categories: Category[];
  industries: Industry[];
  onCancel: () => void;
  onCreated: (p: Profile) => void;
}) {
  const router = useRouter();
  const [slug, setSlug] = useState(industries[0]?.slug ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function create() {
    if (!slug) {
      setError("Sektör seç");
      return;
    }
    const ind = industries.find((i) => i.slug === slug);
    setError(null);
    startTransition(async () => {
      const newP: Profile = {
        slug,
        title: ind ? `${ind.name} için Katalog` : "Yeni Katalog",
        subtitle: "—",
        categorySlugs: [],
        defaultPriceMode: "wholesale",
        enabled: true,
        sortOrder: 100,
      };
      const res = await upsertCatalogProfileAction(newP);
      if (res.ok) {
        onCreated(newP);
        router.refresh();
      } else {
        setError(res.message ?? "Oluşturulamadı");
      }
    });
  }

  return (
    <div className="rounded-md border border-[var(--accent-border)] bg-[var(--surface-2)] p-4">
      <h3 className="text-[12px] font-medium text-[var(--text-primary)]">Yeni katalog profili</h3>
      <p className="mt-1 text-[11px] text-[var(--text-muted)]">
        Sektör seç → profil oluşturulur, sonra düzenle.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <select
          className="h-9 flex-1 rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] px-2 text-[12px]"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
        >
          {industries.map((i) => (
            <option key={i.slug} value={i.slug}>
              {i.name} ({i.customerCount} müşteri)
            </option>
          ))}
        </select>
        <Button onClick={create} disabled={pending}>
          {pending ? "Oluşturuluyor…" : "Oluştur"}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          İptal
        </Button>
      </div>
      {error && <p className="mt-2 text-[11px] text-[var(--danger)]">{error}</p>}
    </div>
  );
}
