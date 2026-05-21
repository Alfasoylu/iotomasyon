import { Lock } from "lucide-react";

import { LogoutButton } from "@/components/dashboard/logout-button";

export default function NoAccessPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[var(--surface-0)] px-4">
      <div className="flex h-14 w-14 items-center justify-center rounded-md border border-[var(--warn-border)] bg-[var(--warn-dim)]">
        <Lock size={20} strokeWidth={1.5} color="var(--warn)" />
      </div>
      <div className="text-center">
        <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--warn)]">
          Yetki Bekleniyor
        </p>
        <h1 className="mt-3 text-[22px] font-semibold tracking-tight text-[var(--text-primary)]">
          Yetkiniz henüz atanmadı.
        </h1>
        <p className="mt-2 max-w-sm text-[13px] leading-6 text-[var(--text-secondary)]">
          Hesabınız aktif ancak herhangi bir modüle erişim izniniz bulunmuyor. Lütfen yöneticinizle iletişime geçin.
        </p>
      </div>
      <LogoutButton />
    </div>
  );
}
