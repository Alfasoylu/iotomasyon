import type { ReactNode } from "react";

interface EmptyStateProps {
  /** Lucide ikon (büyük, decorative) */
  icon?: React.ComponentType<{ className?: string }>;
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
      className={`flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 py-12 px-6 text-center ${className}`}
    >
      {Icon && (
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm">
          <Icon className="h-6 w-6 text-slate-400" />
        </div>
      )}
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      {hint && (
        <p className="mt-1.5 max-w-md text-xs leading-relaxed text-slate-500">
          {hint}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
