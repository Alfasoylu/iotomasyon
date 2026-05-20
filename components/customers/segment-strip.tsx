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
    icon: React.ComponentType<{ className?: string }>;
    tone: string;
  }> = [
    {
      key: "all",
      label: "Tüm Çatılar",
      hint: "tümü",
      count: counts.b2bReseller + counts.installation + counts.marketplace,
      icon: Users,
      tone: "slate",
    },
    {
      key: "B2B_RESELLER",
      label: "B2B Bayilerim",
      hint: "güvenlik şirketi, nalbur — sürekli müşteri",
      count: counts.b2bReseller,
      icon: Users,
      tone: "blue",
    },
    {
      key: "INSTALLATION",
      label: "Montaj Fırsatları",
      hint: "cafe/restoran/site/ofis — tek seferlik",
      count: counts.installation,
      icon: Wrench,
      tone: "amber",
    },
    {
      key: "MARKETPLACE",
      label: "Pazaryeri",
      hint: "Entegra import edilen son kullanıcılar",
      count: counts.marketplace,
      icon: Store,
      tone: "emerald",
    },
  ];

  const TONE_STYLES: Record<string, { active: string; inactive: string; icon: string }> = {
    slate: {
      active: "bg-slate-900 text-white",
      inactive: "bg-white text-slate-700 hover:bg-slate-50",
      icon: "text-slate-500",
    },
    blue: {
      active: "bg-blue-600 text-white",
      inactive: "bg-white text-slate-700 hover:bg-blue-50",
      icon: "text-blue-600",
    },
    amber: {
      active: "bg-amber-600 text-white",
      inactive: "bg-white text-slate-700 hover:bg-amber-50",
      icon: "text-amber-600",
    },
    emerald: {
      active: "bg-emerald-600 text-white",
      inactive: "bg-white text-slate-700 hover:bg-emerald-50",
      icon: "text-emerald-600",
    },
  };

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {items.map((it) => {
        const active = activeSegment === it.key;
        const tone = TONE_STYLES[it.tone];
        const Icon = it.icon;
        const href = it.key === "all" ? "/customers" : `/customers?segment=${it.key}`;
        return (
          <Link
            key={it.key}
            href={href}
            className={`flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 transition ${
              active ? tone.active : tone.inactive
            }`}
            title={it.hint}
          >
            <Icon className={`h-5 w-5 ${active ? "text-white" : tone.icon}`} />
            <div className="min-w-0 flex-1">
              <p className={`text-xs font-medium ${active ? "text-white/80" : "text-slate-500"}`}>
                {it.label}
              </p>
              <p className="text-lg font-bold tabular-nums leading-none">
                {it.count.toLocaleString("tr-TR")}
              </p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
