import Link from "next/link";

import { Card } from "@/components/ui/card";

export const TONE_CLASSES: Record<string, string> = {
  default: "",
  success: "border-emerald-200 bg-emerald-50",
  warning: "border-amber-200 bg-amber-50",
  danger: "border-red-200 bg-red-50",
};

export type StatTone = "default" | "success" | "warning" | "danger";

export function StatCard({
  label,
  value,
  tone = "default",
  accent,
}: {
  label: string;
  value: number | string;
  tone?: StatTone;
  accent?: boolean;
}) {
  const resolvedTone = accent ? "warning" : tone;
  return (
    <Card className={`p-5 ${TONE_CLASSES[resolvedTone]}`}>
      <p className="text-sm uppercase tracking-[0.25em] text-slate-500">{label}</p>
      <p className="mt-5 text-3xl font-semibold text-slate-950">{value}</p>
    </Card>
  );
}

export function LinkedStatCard({
  label,
  value,
  tone = "default",
  href,
}: {
  label: string;
  value: number | string;
  tone?: StatTone;
  href?: string;
}) {
  const card = (
    <Card
      className={`p-5 transition ${TONE_CLASSES[tone]} ${href ? "cursor-pointer hover:shadow-md" : ""}`}
    >
      <p className="text-sm uppercase tracking-[0.25em] text-slate-500">{label}</p>
      <p className="mt-5 text-3xl font-semibold text-slate-950">{value}</p>
    </Card>
  );
  return href ? <Link href={href}>{card}</Link> : card;
}
