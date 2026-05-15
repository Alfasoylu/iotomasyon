import { LogoutButton } from "@/components/dashboard/logout-button";

export default function NoAccessPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[#f8f5ef] px-4">
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-amber-50">
        <span className="text-4xl">🔒</span>
      </div>
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-600">
          Yetki Bekleniyor
        </p>
        <h1 className="mt-3 text-2xl font-semibold text-slate-900">
          Yetkiniz henüz atanmadı.
        </h1>
        <p className="mt-3 max-w-sm text-sm leading-6 text-slate-500">
          Hesabınız aktif ancak herhangi bir modüle erişim izniniz bulunmuyor. Lütfen
          yöneticinizle iletişime geçin.
        </p>
      </div>
      <LogoutButton />
    </div>
  );
}
