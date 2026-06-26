"use client";

import { useState, useTransition } from "react";

import { registerTenantAction } from "@/lib/actions/pdks-register-actions";
import { slugify } from "@/lib/pdks/tenant-provision";

export function RegisterForm() {
  const [companyName, setCompanyName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [adminFullName, setAdminFullName] = useState("");
  const [adminPhone, setAdminPhone] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<string | null>(null);
  const [doneSlug, setDoneSlug] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Slug'a elle dokunulmadıysa şirket adından otomatik öner.
  function onCompanyChange(v: string) {
    setCompanyName(v);
    if (!slugTouched) setSlug(slugify(v));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setErrorField(null);
    startTransition(async () => {
      const r = await registerTenantAction({
        companyName,
        slug,
        adminFullName,
        adminPhone,
        ownerEmail: ownerEmail || undefined,
        password,
      });
      if (!r.ok) {
        setError(r.message);
        setErrorField(r.field ?? null);
        return;
      }
      setDoneSlug(r.slug);
    });
  }

  if (doneSlug) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-900">
        <h2 className="text-lg font-semibold">🎉 Hesabınız oluşturuldu!</h2>
        <p className="mt-2 text-sm leading-6">
          <b>30 günlük ücretsiz denemeniz</b> başladı. Kullanıcı adınız:{" "}
          <code className="rounded bg-white px-1.5 py-0.5 font-mono">{doneSlug}</code>
        </p>
        <p className="mt-3 text-sm leading-6">
          Yönetici telefon ve şifrenizle giriş yapın; personelinizi ekleyip onlara çalışma
          linkini paylaşabilirsiniz.
        </p>
        <a
          href="/personel"
          className="mt-4 inline-block rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
        >
          Girişe git
        </a>
      </div>
    );
  }

  const errCls = (f: string) =>
    `mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 ${
      errorField === f ? "border-red-400" : "border-slate-300"
    }`;

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="text-sm font-medium text-slate-700">Şirket adı</label>
        <input className={errCls("companyName")} value={companyName} onChange={(e) => onCompanyChange(e.target.value)} placeholder="Örn. Soylu İnşaat" autoComplete="organization" />
      </div>

      <div>
        <label className="text-sm font-medium text-slate-700">Kullanıcı adı (çalışma linkiniz)</label>
        <div className="mt-1 flex items-center overflow-hidden rounded-lg border border-slate-300 focus-within:ring-2 focus-within:ring-blue-500">
          <span className="bg-slate-50 px-3 py-2 text-sm text-slate-400">iotomasyon.com/t/</span>
          <input
            className="flex-1 px-2 py-2 text-sm outline-none"
            value={slug}
            onChange={(e) => { setSlugTouched(true); setSlug(slugify(e.target.value)); }}
            placeholder="soylu-insaat"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>
        <p className="mt-1 text-xs text-slate-400">Çalışanlarınız bu linkten girer; sonradan değiştirilemez.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-sm font-medium text-slate-700">Yönetici ad soyad</label>
          <input className={errCls("adminFullName")} value={adminFullName} onChange={(e) => setAdminFullName(e.target.value)} autoComplete="name" />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700">Telefon</label>
          <input className={errCls("adminPhone")} value={adminPhone} onChange={(e) => setAdminPhone(e.target.value)} placeholder="05XX XXX XX XX" inputMode="tel" autoComplete="tel" />
        </div>
      </div>

      <div>
        <label className="text-sm font-medium text-slate-700">E-posta</label>
        <input className={errCls("ownerEmail")} value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} placeholder="ornek@sirket.com" inputMode="email" autoComplete="email" />
      </div>

      <div>
        <label className="text-sm font-medium text-slate-700">Şifre</label>
        <input type="password" className={errCls("password")} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
      >
        {pending ? "Oluşturuluyor…" : "Ücretsiz denemeyi başlat"}
      </button>
      <p className="text-center text-xs text-slate-400">30 gün ücretsiz · Kredi kartı gerekmez</p>
    </form>
  );
}
