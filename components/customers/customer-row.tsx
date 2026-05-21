import Link from "next/link";
import {
  Phone, Mail, MapPin, Clock, Target, Briefcase, PhoneOff, AlertCircle,
  Users as UsersIcon, Briefcase as BriefcaseIcon, FileText, Package,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  formatCustomerStatus,
  getCustomerStatusTone,
} from "@/lib/customer-utils";
import { CUSTOMER_TYPE_LABELS } from "@/types/customers";
import type { CustomerStatus } from "@prisma/client";
import { displayPhone } from "@/lib/customer-contact";
import { shortenCustomerName } from "@/lib/display-helpers";
import { calcLeadScore, daysSinceContact } from "@/lib/customer-lead-score";
import { calcInfoCompleteness } from "@/lib/customer-info-completeness";
import type { CustomerStatsRow } from "@/services/customer-cohort-service";
import { CustomerRowActions } from "./customer-row-actions";
import { CustomerAvatar } from "./customer-avatar";

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
  // Phase 95b yeni alanlar
  tags: string[];
  doNotCall: boolean;
  avatarUrl: string | null;
  taxNumber: string | null;
  address: string | null;
  customerNotes: string | null;
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

function formatNextAction(d: Date | null, title: string | null): { tone: "danger" | "warn" | "neutral"; label: string } {
  if (!d) return { tone: "neutral", label: "" };
  const days = Math.floor((d.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  const dateStr = new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "2-digit",
  }).format(d);
  if (days < 0) return { tone: "danger", label: `${dateStr} (${Math.abs(days)}g gecikti): ${title ?? ""}` };
  if (days === 0) return { tone: "warn", label: `BUGÜN: ${title ?? ""}` };
  if (days === 1) return { tone: "warn", label: `YARIN: ${title ?? ""}` };
  if (days < 7) return { tone: "neutral", label: `${dateStr} (${days}g): ${title ?? ""}` };
  return { tone: "neutral", label: `${dateStr}: ${title ?? ""}` };
}

const SCORE_BG: Record<"success" | "info" | "warning" | "neutral", string> = {
  success: "bg-[var(--ok-dim)] text-[var(--ok)] border-[var(--ok-border)]",
  info: "bg-[var(--info-dim)] text-[var(--info)] border-[var(--info-border)]",
  warning: "bg-[var(--warn-dim)] text-[var(--warn)] border-[var(--warn-border)]",
  neutral: "bg-[var(--surface-3)] text-[var(--text-secondary)] border-[var(--border-default)]",
};

export function CustomerRow({
  customer,
  stats,
  recentActivity,
}: {
  customer: CustomerLike;
  stats: CustomerStatsRow | null;
  recentActivity?: { byUserName: string; minutesAgo: number } | null;
}) {
  const days = daysSinceContact(customer.lastContactedAt);
  const score = calcLeadScore({
    activeInterestsCount: stats?.activeInterestsCount ?? 0,
    lifetimeOrdersCount: stats?.lifetimeOrders ?? 0,
    daysSinceContact: days,
    openQuoteCount: stats?.openQuoteCount ?? 0,
    status: customer.status,
  });

  // Bilgi tamlığı skoru (kullanıcı talebi)
  const info = calcInfoCompleteness({
    phone: customer.phone,
    whatsapp: customer.whatsapp,
    email: customer.email,
    taxNumber: customer.taxNumber,
    company: customer.company,
    city: customer.city,
    address: customer.address,
    customerNotes: customer.customerNotes,
    hasInterests: stats?.hasInterests ?? false,
  });

  const phoneDisplay = customer.phone ? displayPhone(customer.phone) : null;
  const cityDisplay = customer.city;
  const nextAction = stats?.nextActionAt ? formatNextAction(stats.nextActionAt, stats.nextActionTitle) : null;

  return (
    <Card
      data-customer-row={customer.id}
      className={`p-4 transition hover:border-[var(--border-strong)] ${customer.doNotCall ? "opacity-60" : ""}`}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-start">
        {/* Avatar + Lead skoru kombo (sol blok) */}
        <div className="flex-shrink-0 flex items-center gap-2.5">
          <CustomerAvatar name={customer.name} avatarUrl={customer.avatarUrl} size="md" />
          <div
            className={`flex h-12 w-12 flex-shrink-0 flex-col items-center justify-center rounded-md border ${SCORE_BG[score.tone]}`}
            title={`Lead Skoru ${score.score}/100 — ${score.label}`}
          >
            <span className="font-mono text-base font-semibold tabular-nums leading-none">{score.score}</span>
            <span className="mt-0.5 text-[8px] uppercase tracking-wider opacity-80">
              {score.label}
            </span>
          </div>
        </div>

        {/* Sol blok: Ad + iletişim + meta */}
        <div className="min-w-0 flex-1 space-y-2">
          {/* Başlık satırı */}
          <div className="flex flex-wrap items-start gap-2">
            <div className="min-w-0 flex-1">
              <Link
                href={`/customers/${customer.id}`}
                className="text-base font-semibold text-[var(--text-primary)] hover:text-[var(--accent)]"
                title={customer.name}
              >
                {shortenCustomerName(customer.name, 60)}
              </Link>
              {customer.company && customer.company.trim() !== customer.name.trim() && (
                <p className="text-xs text-[var(--text-muted)] truncate">{customer.company}</p>
              )}
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {recentActivity && (
                <span
                  className="inline-flex items-center gap-1 rounded-md border border-[var(--warn-border)] bg-[var(--warn-dim)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--warn)]"
                  title={`${recentActivity.byUserName} bu müşteriyi son ${recentActivity.minutesAgo} dakika önce aradı. Çakışmayı önle.`}
                >
                  <UsersIcon size={14} strokeWidth={1.5} />
                  {recentActivity.byUserName.split(" ")[0]} aktif · {recentActivity.minutesAgo}dk
                </span>
              )}
              {customer.doNotCall && (
                <span
                  className="inline-flex items-center gap-1 rounded-md border border-[var(--danger-border)] bg-[var(--danger-dim)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--danger)]"
                  title="Aramayın işaretli (DND)"
                >
                  <PhoneOff size={14} strokeWidth={1.5} />
                  DND
                </span>
              )}
              <Badge tone={getCustomerStatusTone(customer.status)}>
                {formatCustomerStatus(customer.status)}
              </Badge>
              {customer.customerType && (
                <Badge variant="neutral">
                  {CUSTOMER_TYPE_LABELS[customer.customerType as keyof typeof CUSTOMER_TYPE_LABELS]}
                </Badge>
              )}
            </div>
          </div>

          {/* Tags satırı */}
          {customer.tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              {customer.tags.slice(0, 5).map((tag) => (
                <span
                  key={tag}
                  className="rounded-md border border-[var(--info-border)] bg-[var(--info-dim)] px-2 py-0.5 text-[10px] font-medium text-[var(--info)]"
                >
                  {tag}
                </span>
              ))}
              {customer.tags.length > 5 && (
                <span className="text-[10px] text-[var(--text-muted)]">+{customer.tags.length - 5}</span>
              )}
            </div>
          )}

          {/* İletişim satırı */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-secondary)]">
            {phoneDisplay ? (
              <span className="flex items-center gap-1.5">
                <Phone size={14} strokeWidth={1.5} className="text-[var(--text-muted)]" />
                <span className="font-mono tabular-nums">{phoneDisplay}</span>
              </span>
            ) : (
              <span
                className="flex items-center gap-1.5 text-[var(--warn)]"
                title={`Bilgi tamlığı %${info.score}. Eksik: ${info.missing.join(", ")}`}
              >
                <AlertCircle size={14} strokeWidth={1.5} />
                <span className="text-[11px] italic">Telefon yok</span>
              </span>
            )}
            {customer.email && (
              <span className="flex items-center gap-1.5 truncate">
                <Mail size={14} strokeWidth={1.5} className="text-[var(--text-muted)] flex-shrink-0" />
                <span className="truncate">{customer.email}</span>
              </span>
            )}
            {cityDisplay && (
              <span className="flex items-center gap-1.5">
                <MapPin size={14} strokeWidth={1.5} className="text-[var(--text-muted)]" />
                {cityDisplay}
              </span>
            )}
            {customer.owner?.name && (
              <span className="flex items-center gap-1.5 text-[var(--text-muted)]">
                <Briefcase size={14} strokeWidth={1.5} className="text-[var(--text-muted)]" />
                {customer.owner.name}
              </span>
            )}
          </div>

          {/* İstatistik satırı */}
          {stats && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--text-muted)]">
              {stats.activeInterestsCount > 0 && (
                <span className="inline-flex items-center gap-1">
                  <BriefcaseIcon size={14} strokeWidth={1.5} />
                  <span className="font-mono tabular-nums">{stats.activeInterestsCount}</span> aktif ilgi
                </span>
              )}
              {stats.openQuoteCount > 0 && (
                <span className="inline-flex items-center gap-1">
                  <FileText size={14} strokeWidth={1.5} />
                  <span className="font-mono tabular-nums">{stats.openQuoteCount}</span> açık teklif
                </span>
              )}
              {stats.lifetimeOrders > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Package size={14} strokeWidth={1.5} />
                  <span className="font-mono tabular-nums">{stats.lifetimeOrders}</span> sipariş ·{" "}
                  <span className="font-mono font-medium tabular-nums text-[var(--text-secondary)]">
                    {fmtTry(stats.lifetimeRevenueTry)}
                  </span>{" "}
                  ciro
                </span>
              )}
            </div>
          )}

          {/* Son temas + Sonraki aksiyon */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
            <span className="flex items-center gap-1 text-[var(--text-muted)]">
              <Clock size={14} strokeWidth={1.5} />
              Son temas: <strong className="text-[var(--text-secondary)]">{relTime(customer.lastContactedAt)}</strong>
            </span>
            {nextAction && (
              <span
                className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 ${
                  nextAction.tone === "danger"
                    ? "border border-[var(--danger-border)] bg-[var(--danger-dim)] text-[var(--danger)] pulse-urgent"
                    : nextAction.tone === "warn"
                      ? "border border-[var(--warn-border)] bg-[var(--warn-dim)] text-[var(--warn)]"
                      : "text-[var(--text-secondary)]"
                }`}
              >
                <Target size={14} strokeWidth={1.5} />
                {nextAction.label}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Inline aksiyonlar */}
      <div className="mt-3 pt-3 border-t border-[var(--border-subtle)]">
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
