import Link from "next/link";
import { Users, Wrench, Store } from "lucide-react";

interface SegmentCounts {
  b2bReseller: number;
  installation: number;
  marketplace: number;
}

export function SegmentStrip({
  counts,
  activeSegment,
}: {
  counts: SegmentCounts;
  activeSegment: string;
}) {
  const items: Array<{
    key: string;
    label: string;
    hint: string;
    count: number;
    icon: React.ComponentType<{ className?: string; size?: number; strokeWidth?: number }>;
  }> = [
    {
      key: "all",
      label: "Tüm Çatılar",
      hint: "tümü",
      count: counts.b2bReseller + counts.installation + counts.marketplace,
      icon: Users,
    },
    {
      key: "B2B_RESELLER",
      label: "B2B Bayilerim",
      hint: "güvenlik şirketi, nalbur — sürekli müşteri",
      count: counts.b2bReseller,
      icon: Users,
    },
    {
      key: "INSTALLATION",
      label: "Montaj Fırsatları",
      hint: "cafe/restoran/site/ofis — tek seferlik",
      count: counts.installation,
      icon: Wrench,
    },
    {
      key: "MARKETPLACE",
      label: "Pazaryeri",
      hint: "Entegra import edilen son kullanıcılar",
      count: counts.marketplace,
      icon: Store,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {items.map((it) => {
        const active = activeSegment === it.key;
        const Icon = it.icon;
        const href = it.key === "all" ? "/customers" : `/customers?segment=${it.key}`;
        const baseCls =
          "flex items-center gap-3 rounded-md border px-4 py-3 transition-colors";
        const activeCls =
          "border-[var(--accent-border)] bg-[var(--accent-dim)] text-[var(--accent)]";
        const inactiveCls =
          "border-[var(--border-default)] bg-[var(--surface-2)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-3)]";
        return (
          <Link
            key={it.key}
            href={href}
            className={`${baseCls} ${active ? activeCls : inactiveCls}`}
            title={it.hint}
          >
            <Icon
              size={18}
              strokeWidth={1.5}
              className={active ? "text-[var(--accent)]" : "text-[var(--text-muted)]"}
            />
            <div className="min-w-0 flex-1">
              <p
                className={`text-[11px] font-semibold uppercase tracking-widest ${
                  active ? "text-[var(--accent)]" : "text-[var(--text-muted)]"
                }`}
              >
                {it.label}
              </p>
              <p
                className={`font-mono text-lg font-semibold tabular-nums leading-none ${
                  active ? "text-[var(--accent)]" : "text-[var(--text-primary)]"
                }`}
              >
                {it.count.toLocaleString("tr-TR")}
              </p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
