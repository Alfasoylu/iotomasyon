import Link from "next/link";

/**
 * Public Header — iotomasyon.com kök sayfası için.
 *
 * Sol: marka adı
 * Sağ: session yoksa "Giriş", varsa "Panele Dön"
 */
export function PublicHeader({ sessionEmail }: { sessionEmail: string | null }) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
            İotomasyon
          </span>
          <span className="hidden text-xs text-slate-400 sm:inline">
            · Depo Arama
          </span>
        </div>

        {sessionEmail ? (
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 hover:text-slate-900"
            title={sessionEmail}
          >
            🏠 Panele Dön
          </Link>
        ) : (
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
          >
            🔒 Giriş
          </Link>
        )}
      </div>
    </header>
  );
}
