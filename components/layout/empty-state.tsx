import type { ReactNode } from "react";

interface EmptyStateProps {
  /** Lucide ikon (büyük, decorative) */
  icon?: React.ComponentType<{ className?: string; size?: number; strokeWidth?: number }>;
  /** Ana başlık (örn. "Henüz müşteri yok") */
  title: string;
  /** Altyazı — bu durumun ne zaman çözüleceğini açıklar */
  hint?: string;
  /** Sağ-alt aksiyon (örn. "Yeni müşteri ekle" butonu) */
  action?: ReactNode;
  className?: string;
}

/**
 * Tüm boş durumlar için tutarlı bir bileşen.
 *
 * Eskiden her sayfada farklı tonda mesaj vardı:
 *   "Bu filtrelerle eşleşen müşteri bulunamadı" (Müşteriler)
 *   "Henüz kategori eklenmedi" (Kategoriler)
 *   "Henüz kampanya oluşturulmadı" (Kampanyalar)
 *
 * Standart pattern:
 *   - Büyük ikon (decorative)
 *   - Tek satır başlık (kalın)
 *   - Altyazı: ne yapması gerektiğini söyler
 *   - Opsiyonel aksiyon butonu
 *
 * ```tsx
 * <EmptyState
 *   icon={Users}
 *   title="Henüz müşteri yok"
 *   hint="İlk müşterini eklediğinde burada görünecek."
 *   action={<Link href="/customers/new"><Button>Yeni müşteri</Button></Link>}
 * />
 * ```
 */
export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
  className = "",
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-lg border border-dashed border-[var(--border-default)] bg-[var(--surface-1)] py-12 px-6 text-center ${className}`}
    >
      {Icon && (
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)]">
          <Icon size={22} strokeWidth={1.5} className="text-[var(--text-muted)]" />
        </div>
      )}
      <p className="text-sm font-semibold text-[var(--text-primary)]">{title}</p>
      {hint && (
        <p className="mt-1.5 max-w-md text-xs leading-relaxed text-[var(--text-secondary)]">
          {hint}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
