import Link from "next/link";
import { Ban } from "lucide-react";

export default function ForbiddenPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 py-24">
      <div className="flex h-14 w-14 items-center justify-center rounded-md border border-[var(--danger-border)] bg-[var(--danger-dim)]">
        <Ban size={20} strokeWidth={1.5} color="var(--danger)" />
      </div>
      <div className="text-center">
        <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--danger)]">
          Erişim Engellendi
        </p>
        <h1 className="mt-3 text-[22px] font-semibold tracking-tight text-[var(--text-primary)]">
          Bu sayfaya erişim yetkiniz yok.
        </h1>
        <p className="mt-2 max-w-sm text-[13px] leading-6 text-[var(--text-secondary)]">
          Erişmek istediğiniz sayfa için gerekli izne sahip değilsiniz. Yöneticinizle iletişime geçerek gerekli izni talep edebilirsiniz.
        </p>
      </div>
      <Link
        href="/dashboard"
        className="rounded-md bg-[var(--accent)] px-4 py-2 text-[13px] font-medium text-[var(--accent-fg)] transition-all duration-100 hover:brightness-110"
      >
        Panoya Dön
      </Link>
    </div>
  );
}
