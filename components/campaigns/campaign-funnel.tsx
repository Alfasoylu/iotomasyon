import type { CampaignFunnel } from "@/services/outreach-service";

type Props = { funnel: CampaignFunnel; currency: string };

function pct(num: number, den: number): string {
  if (den === 0) return "—";
  return `%${Math.round((num / den) * 100)}`;
}

function fmt(amount: number, currency: string): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

type Metric = { label: string; value: string | number; sub?: string; highlight?: boolean };

export function CampaignFunnel({ funnel, currency }: Props) {
  const { total, sent, replied, quoted, won, revenue } = funnel;

  const metrics: Metric[] = [
    { label: "Toplam alıcı", value: total },
    { label: "Gönderilen", value: sent, sub: pct(sent, total) },
    { label: "Cevap veren", value: replied, sub: pct(replied, sent) },
    { label: "Teklif çıkan", value: quoted, sub: pct(quoted, replied) },
    { label: "Kazanılan", value: won, sub: pct(won, quoted), highlight: won > 0 },
    { label: "Tahmini gelir", value: revenue > 0 ? fmt(revenue, currency) : "—", highlight: revenue > 0 },
  ];

  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
      {metrics.map((m) => (
        <div
          key={m.label}
          className={`rounded-2xl border p-4 text-center ${
            m.highlight
              ? "border-emerald-200 bg-emerald-50"
              : "border-slate-100 bg-white"
          }`}
        >
          <p className="text-xs font-medium uppercase tracking-[0.15em] text-slate-500">{m.label}</p>
          <p className={`mt-2 text-xl font-semibold tabular-nums ${m.highlight ? "text-emerald-700" : "text-slate-900"}`}>
            {m.value}
          </p>
          {m.sub ? (
            <p className="mt-1 text-xs text-slate-400">{m.sub}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
