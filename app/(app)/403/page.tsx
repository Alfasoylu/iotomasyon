import Link from "next/link";

export default function ForbiddenPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 py-24">
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-red-50">
        <span className="text-4xl">🚫</span>
      </div>
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-red-500">
          Erişim Engellendi
        </p>
        <h1 className="mt-3 text-2xl font-semibold text-slate-900">
          Bu sayfaya erişim yetkiniz yok.
        </h1>
        <p className="mt-3 max-w-sm text-sm leading-6 text-slate-500">
          Erişmek istediğiniz sayfa için gerekli izne sahip değilsiniz. Yöneticinizle
          iletişime geçerek gerekli izni talep edebilirsiniz.
        </p>
      </div>
      <Link
        href="/dashboard"
        className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700"
      >
        Panoya Dön
      </Link>
    </div>
  );
}
