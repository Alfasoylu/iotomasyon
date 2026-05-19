import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface PageHeaderProps {
  /** Üst kısmındaki breadcrumb yolu (örn. [{ label: "Pazaryerleri", href: "/marketplace" }, { label: "Kârlılık" }]) */
  breadcrumb?: BreadcrumbItem[];
  /** Sayfa başlığı — H1 (örn. "Sermaye Sağlığı") */
  title: string;
  /** 1 cümlelik açıklama — yeni kullanıcının "bu sayfa ne için" sorusunu çözer */
  subtitle?: string;
  /** Lucide ikonu (opsiyonel — sayfa türünü görsel olarak gösterir) */
  icon?: React.ComponentType<{ className?: string }>;
  /** Sağ tarafta gösterilen aksiyon butonları (yeni kayıt, dışa aktar, vb.) */
  actions?: ReactNode;
  /** Başlığın altında küçük durum rozeti / mini bilgi şeridi */
  meta?: ReactNode;
}

/**
 * Tüm sayfaların üst kısmında kullanılan tek standart başlık bileşeni.
 *
 * Faydaları:
 *   1. Breadcrumb ile kullanıcı nerede olduğunu görür
 *   2. Tutarlı tipografi (H1 + subtitle)
 *   3. Icon ile sayfa türü görsel olarak ayırt edilir
 *   4. Actions slot sağ tarafa hizalanmış aksiyon butonları için
 *   5. Meta slot — duruma göre rozet, kur bilgisi, mini KPI
 *
 * Örnek kullanım:
 * ```tsx
 * <PageHeader
 *   icon={Heart}
 *   breadcrumb={[{ label: "Günlük Durum" }, { label: "Sermaye Sağlığı" }]}
 *   title="Sermaye Sağlığı"
 *   subtitle="Günde bir kez aç, ne yapmalıyım kararla — sermayenin nereye bağlı, ne kadar nakit beklenir."
 *   actions={<Button>Yenile</Button>}
 * />
 * ```
 */
export function PageHeader({
  breadcrumb,
  title,
  subtitle,
  icon: Icon,
  actions,
  meta,
}: PageHeaderProps) {
  return (
    <div className="mb-6 space-y-3">
      {/* Breadcrumb */}
      {breadcrumb && breadcrumb.length > 0 && (
        <nav className="flex items-center gap-1 text-xs text-slate-500">
          {breadcrumb.map((b, i) => {
            const isLast = i === breadcrumb.length - 1;
            return (
              <span key={i} className="flex items-center gap-1">
                {b.href && !isLast ? (
                  <Link
                    href={b.href}
                    className="hover:text-slate-900 transition-colors"
                  >
                    {b.label}
                  </Link>
                ) : (
                  <span className={isLast ? "text-slate-700 font-medium" : ""}>
                    {b.label}
                  </span>
                )}
                {!isLast && (
                  <ChevronRight className="h-3 w-3 text-slate-300" />
                )}
              </span>
            );
          })}
        </nav>
      )}

      {/* Title row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3 min-w-0">
          {Icon && (
            <div className="flex-shrink-0 mt-1 flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white">
              <Icon className="h-5 w-5" />
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-1 text-sm leading-relaxed text-slate-600">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {actions && <div className="flex flex-shrink-0 items-center gap-2">{actions}</div>}
      </div>

      {/* Meta strip */}
      {meta && <div className="flex flex-wrap items-center gap-2">{meta}</div>}
    </div>
  );
}
