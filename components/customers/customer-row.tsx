import Link from "next/link";
import { Phone, Mail, MapPin, Clock, Target, Briefcase } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  formatCustomerStatus,
  getCustomerStatusTone,
} from "@/lib/customer-utils";
import { CUSTOMER_TYPE_LABELS } from "@/types/customers";
import type { CustomerStatus } from "@prisma/client";
import { displayPhone } from "@/lib/customer-contact";
import { calcLeadScore, daysSinceContact } from "@/lib/customer-lead-score";
import type { CustomerStatsRow } from "@/services/customer-cohort-service";
import { CustomerRowActions } from "./customer-row-actions";

interface CustomerLike {
  id: string;
  name: string;
  company: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  city: string | null;
  status: CustomerStatus;
  customerType: string | null;
  source: string | null;
  owner: { id: string; name: string } | null;
  lastContactedAt: Date | null;
}

function fmtTry(n: number): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  }).format(n);
}

function relTime(d: Date | null): string {
  if (!d) return "hiç temas yok";
  const days = Math.floor((Date.now() - d.getTime()) / (24 * 60 * 60 * 1000));
  if (days === 0) return "bugün";
  if (days === 1) return "dün";
  if (days < 7) return `${days} gün önce`;
  if (days < 30) return `${Math.floor(days / 7)} hafta önce`;
  if (days < 365) return `${Math.floor(days / 30)} ay önce`;
  return `${Math.floor(days / 365)} yıl önce`;
}

function formatNextAction(d: Date | null, title: string | null): string {
  if (!d) return "";
  const days = Math.floor((d.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  const dateStr = new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "2-digit",
  }).format(d);
  if (days < 0) return `🔴 ${dateStr} (${Math.abs(days)}g gecikti): ${title ?? ""}`;
  if (days === 0) return `🟡 BUGÜN: ${title ?? ""}`;
  if (days === 1) return `🟡 YARIN: ${title ?? ""}`;
  if (days < 7) return `${dateStr} (${days}g): ${title ?? ""}`;
  return `${dateStr}: ${title ?? ""}`;
}

const SCORE_BG = {
  success: "bg-emerald-100 text-emerald-700 border-emerald-300",
  info: "bg-blue-100 text-blue-700 border-blue-300",
  warning: "bg-amber-100 text-amber-700 border-amber-300",
  neutral: "bg-slate-100 text-slate-600 border-slate-300",
};

export function CustomerRow({
  customer,
  stats,
}: {
  customer: CustomerLike;
  stats: CustomerStatsRow | null;
}) {
  const days = daysSinceContact(customer.lastContactedAt);
  const score = calcLeadScore({
    activeInterestsCount: stats?.activeInterestsCount ?? 0,
    lifetimeOrdersCount: stats?.lifetimeOrders ?? 0,
    daysSinceContact: days,
    openQuoteCount: stats?.openQuoteCount ?? 0,
    status: customer.status,
  });

  const phoneDisplay = customer.phone ? displayPhone(customer.phone) : null;
  const cityDisplay = customer.city;

  return (
    <Card className="p-4 transition hover:border-slate-300 hover:shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start">
        {/* Lead skoru rozeti */}
        <div
          className={`flex h-14 w-14 flex-shrink-0 flex-col items-center justify-center rounded-xl border ${SCORE_BG[score.tone]}`}
          title={`Lead Skoru ${score.score}/100 — ${score.label}`}
        >
          <span className="text-xl font-bold tabular-nums leading-none">{score.score}</span>
          <span className="mt-0.5 text-[9px] uppercase tracking-wide opacity-80">
            {score.label}
          </span>
        </div>

        {/* Sol blok: Ad + iletişim + meta */}
        <div className="min-w-0 flex-1 space-y-2">
          {/* Başlık satırı */}
          <div className="flex flex-wrap items-start gap-2">
            <div className="min-w-0 flex-1">
              <Link
                href={`/customers/${customer.id}`}
                className="text-base font-semibold text-slate-950 hover:text-slate-700"
              >
                {customer.name}
              </Link>
              {customer.company && (
                <p className="text-xs text-slate-500 truncate">{customer.company}</p>
              )}
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <Badge tone={getCustomerStatusTone(customer.status)}>
                {formatCustomerStatus(customer.status)}
              </Badge>
              {customer.customerType && (
                <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                  {CUSTOMER_TYPE_LABELS[customer.customerType as keyof typeof CUSTOMER_TYPE_LABELS]}
                </span>
              )}
            </div>
          </div>

          {/* İletişim satırı */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
            {phoneDisplay && (
              <span className="flex items-center gap-1.5">
                <Phone className="h-3 w-3 text-slate-400" />
                <span className="font-mono">{phoneDisplay}</span>
              </span>
            )}
            {customer.email && (
              <span className="flex items-center gap-1.5 truncate">
                <Mail className="h-3 w-3 text-slate-400 flex-shrink-0" />
                <span className="truncate">{customer.email}</span>
              </span>
            )}
            {cityDisplay && (
              <span className="flex items-center gap-1.5">
                <MapPin className="h-3 w-3 text-slate-400" />
                {cityDisplay}
              </span>
            )}
            {customer.owner?.name && (
              <span className="flex items-center gap-1.5 text-slate-500">
                <Briefcase className="h-3 w-3 text-slate-400" />
                {customer.owner.name}
              </span>
            )}
          </div>

          {/* İstatistik satırı */}
          {stats && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
              {stats.activeInterestsCount > 0 && (
                <span>💼 {stats.activeInterestsCount} aktif ilgi</span>
              )}
              {stats.openQuoteCount > 0 && (
                <span>📄 {stats.openQuoteCount} açık teklif</span>
              )}
              {stats.lifetimeOrders > 0 && (
                <span>
                  📦 {stats.lifetimeOrders} sipariş ·{" "}
                  <span className="font-mono font-medium text-slate-700">
                    {fmtTry(stats.lifetimeRevenueTry)}
                  </span>{" "}
                  ciro
                </span>
              )}
            </div>
          )}

          {/* Son temas + Sonraki aksiyon */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
            <span className="flex items-center gap-1 text-slate-500">
              <Clock className="h-3 w-3" />
              Son temas: <strong className="text-slate-700">{relTime(customer.lastContactedAt)}</strong>
            </span>
            {stats?.nextActionAt && (
              <span className="flex items-center gap-1 text-slate-600">
                <Target className="h-3 w-3" />
                {formatNextAction(stats.nextActionAt, stats.nextActionTitle)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Inline aksiyonlar */}
      <div className="mt-3 pt-3 border-t border-slate-100">
        <CustomerRowActions
          customerId={customer.id}
          phone={customer.phone}
          whatsapp={customer.whatsapp}
          detailHref={`/customers/${customer.id}`}
        />
      </div>
    </Card>
  );
}
