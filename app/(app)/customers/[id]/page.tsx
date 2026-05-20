import Link from "next/link";
import { notFound } from "next/navigation";

import { CustomerWorkspaceTabs } from "@/components/customers/customer-workspace-tabs";
import { CustomerAttributeSection } from "@/components/customers/customer-attribute-section";
import { CategoryInterestDeleteButton } from "@/components/categories/category-interest-delete-button";
import { CategoryInterestForm } from "@/components/categories/category-interest-form";
import { CustomerDeleteButton } from "@/components/customers/customer-delete-button";
import { CustomerWhatsAppButton } from "@/components/customers/customer-whatsapp-button";
import { CustomerProductSuggestionsWidget } from "@/components/customers/customer-product-suggestions-widget";
import { getProductSuggestionsForCustomer } from "@/services/customer-product-suggestions-service";
import { CustomerInterestDeleteButton } from "@/components/customers/customer-interest-delete-button";
import { CustomerInterestForm } from "@/components/customers/customer-interest-form";
import { CustomerNoteForm } from "@/components/customers/customer-note-form";
import { CustomerTaskCompleteButton } from "@/components/customers/customer-task-complete-button";
import { CustomerTaskForm } from "@/components/customers/customer-task-form";
import { QuoteForm } from "@/components/quotes/quote-form";
import { QuoteWhatsAppButton } from "@/components/quotes/quote-whatsapp-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  formatCustomerStatus,
  formatInterestStage,
  formatNoteType,
  formatTaskPriority,
  formatTaskStatus,
  getCustomerStatusTone,
  getInterestStageTone,
  getTaskPriorityTone,
  getTaskStatusTone,
} from "@/lib/customer-utils";
import {
  formatDisplayPair,
  formatQuoteStatus,
  getQuoteStatusTone,
  resolveDisplayAmounts,
} from "@/lib/quote-utils";
import { formatDateTime } from "@/lib/utils";
import { listAttributes } from "@/services/attribute-service";
import { listCategoriesForSelect } from "@/services/category-service";
import { getCustomerById, listCustomerInterestProducts } from "@/services/customer-service";
import { listQuoteTemplates } from "@/services/quote-template-service";
import { listUsersWithTasks } from "@/services/task-service";
import { getCustomerStats } from "@/services/customer-cohort-service";
import { listCustomerTimeline } from "@/services/customer-timeline-service";
import { calcLeadScore, daysSinceContact } from "@/lib/customer-lead-score";
import { displayPhone, telLink, whatsappLink } from "@/lib/customer-contact";
import { CUSTOMER_TYPE_LABELS } from "@/types/customers";
import { Phone, MessageCircle, Mail, MapPin, Briefcase, Clock, Target, Heart, ShoppingBag, Activity as ActivityIcon } from "lucide-react";
import { CustomerRowActions } from "@/components/customers/customer-row-actions";
import { CustomerTimeline } from "@/components/customers/customer-timeline";
import { OutcomeChips } from "@/components/customers/outcome-chips";
import { InlineStatusEditor } from "@/components/customers/inline-status-editor";
import { CustomerAvatar } from "@/components/customers/customer-avatar";
import { prisma } from "@/lib/prisma";
import { requirePermission, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const currentUser = await requirePermission(PERMISSIONS.CUSTOMERS_READ);
  const { id } = await params;
  const canAssign = await checkPermission(currentUser, PERMISSIONS.TASKS_ASSIGN);
  const [{ databaseAvailable, customer }, productOptionsResult, categoryOptionsResult, allAttributes, quoteTemplates, taskUsers, marketplaceStats, statsMap, timelineEvents, whatsAppTemplates, productSuggestions] =
    await Promise.all([
      getCustomerById(id),
      listCustomerInterestProducts(),
      listCategoriesForSelect(),
      listAttributes(),
      listQuoteTemplates(),
      canAssign ? listUsersWithTasks() : Promise.resolve([]),
      fetchCustomerMarketplaceStats(id),
      getCustomerStats([id]),
      listCustomerTimeline(id, 100),
      prisma.messageTemplate.findMany({
        where: { isActive: true, channel: "whatsapp" },
        select: { id: true, name: true, body: true, category: true },
        orderBy: [{ usageCount: "desc" }, { name: "asc" }],
        take: 20,
      }).catch(() => [] as Array<{ id: string; name: string; body: string; category: string | null }>),
      getProductSuggestionsForCustomer(id, 6).catch(() => []),
    ]);
  const stats = statsMap.get(id) ?? null;

  if (!databaseAvailable) {
    return (
      <div className="space-y-6">
        <div>
          <Link
            href="/customers"
            className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.3em] text-slate-500 hover:text-slate-900 transition"
          >
            ← Müşteriler
          </Link>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
            Müşteri detayı geçici olarak kullanılamıyor
          </h1>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            Veritabanı bağlantısı şu anda kullanılamıyor. Bağlantı geri geldiğinde müşteri
            detayları tekrar yüklenecek.
          </p>
        </div>

        <Card className="border-amber-200 bg-amber-50 p-6 text-sm leading-7 text-amber-900">
          Canlı müşteri verisi alınamadığı için detay ekranı gösterilemiyor.
        </Card>
      </div>
    );
  }

  if (!customer) {
    notFound();
  }

  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();

  const recentQuotes = customer.quotes.slice(0, 3);

  // Lead skoru
  const days = daysSinceContact(customer.lastContactedAt);
  const leadScore = calcLeadScore({
    activeInterestsCount: stats?.activeInterestsCount ?? 0,
    lifetimeOrdersCount: stats?.lifetimeOrders ?? 0,
    daysSinceContact: days,
    openQuoteCount: stats?.openQuoteCount ?? 0,
    status: customer.status,
  });

  const SCORE_BG_HERO = {
    success: "bg-emerald-100 text-emerald-700 border-emerald-300",
    info: "bg-blue-100 text-blue-700 border-blue-300",
    warning: "bg-amber-100 text-amber-700 border-amber-300",
    neutral: "bg-slate-100 text-slate-600 border-slate-300",
  } as const;

  function relTime(d: Date | null): string {
    if (!d) return "hiç temas yok";
    const dt = new Date(d).getTime();
    const ds = Math.floor((Date.now() - dt) / (24 * 60 * 60 * 1000));
    if (ds === 0) return "bugün";
    if (ds === 1) return "dün";
    if (ds < 7) return `${ds} gün önce`;
    if (ds < 30) return `${Math.floor(ds / 7)} hafta önce`;
    if (ds < 365) return `${Math.floor(ds / 30)} ay önce`;
    return `${Math.floor(ds / 365)} yıl önce`;
  }

  const phoneHref = telLink(customer.phone || customer.whatsapp);
  const waHref = whatsappLink(customer.whatsapp || customer.phone);
  const phoneDisplay = customer.phone ? displayPhone(customer.phone) : null;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
      {/* ── Main workspace ─────────────────────────────────────── */}
      <div className="min-w-0 space-y-6">
        <Link
          href="/customers"
          className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.3em] text-slate-500 hover:text-slate-900 transition"
        >
          ← Müşteriler
        </Link>
        {/* ── HERO KARTI (yeni — çağrı merkezi tasarımı) ─────────────── */}
        <Card className="p-6">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
              {/* Avatar + Lead skoru kombo */}
              <div className="flex-shrink-0 flex items-center gap-3">
                <CustomerAvatar name={customer.name} avatarUrl={customer.avatarUrl} size="lg" />
                <div
                  className={`flex h-16 w-16 flex-shrink-0 flex-col items-center justify-center rounded-2xl border ${SCORE_BG_HERO[leadScore.tone]}`}
                  title={`Lead Skoru ${leadScore.score}/100 — ${leadScore.label}`}
                >
                  <span className="text-2xl font-bold tabular-nums leading-none">{leadScore.score}</span>
                  <span className="mt-0.5 text-[9px] uppercase tracking-wide opacity-80">
                    {leadScore.label}
                  </span>
                </div>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {/* Status — inline edit dropdown */}
                  <InlineStatusEditor customerId={customer.id} currentStatus={customer.status} />
                  {customer.customerType && (
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                      {CUSTOMER_TYPE_LABELS[customer.customerType]}
                    </span>
                  )}
                  {customer.doNotCall && (
                    <span className="rounded-md bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700">
                      📵 DND
                    </span>
                  )}
                  {customer.tags && customer.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {customer.tags.slice(0, 5).map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-[10px] font-medium text-blue-700"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
                  {customer.name}
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  {customer.company ?? "Firma belirtilmedi"}
                </p>

                {/* İletişim satırı */}
                <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-slate-700">
                  {phoneDisplay && phoneHref && (
                    <a href={phoneHref} className="flex items-center gap-1.5 font-mono hover:text-emerald-700">
                      <Phone className="h-4 w-4 text-emerald-600" />
                      <span className="font-medium">{phoneDisplay}</span>
                    </a>
                  )}
                  {customer.email && (
                    <a href={`mailto:${customer.email}`} className="flex items-center gap-1.5 hover:text-blue-700">
                      <Mail className="h-4 w-4 text-slate-400" />
                      {customer.email}
                    </a>
                  )}
                  {customer.city && (
                    <span className="flex items-center gap-1.5 text-slate-600">
                      <MapPin className="h-4 w-4 text-slate-400" />
                      {[customer.district, customer.city].filter(Boolean).join(" / ")}
                    </span>
                  )}
                  {customer.taxNumber && (
                    <span className="flex items-center gap-1.5 text-slate-600">
                      <Briefcase className="h-4 w-4 text-slate-400" />
                      VN: <span className="font-mono">{customer.taxNumber}</span>
                      {customer.taxOffice && <span className="text-slate-400">({customer.taxOffice})</span>}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Son temas + Sonraki aksiyon — kritik bant */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5">
                <span className="flex items-center gap-1.5 text-slate-600">
                  <Clock className="h-4 w-4 text-slate-400" />
                  Son temas: <strong className="text-slate-900">{relTime(customer.lastContactedAt)}</strong>
                </span>
                {stats?.nextActionAt ? (
                  <span className="flex items-center gap-1.5 text-slate-700">
                    <Target className="h-4 w-4 text-amber-500" />
                    Sonraki:{" "}
                    <strong className="text-slate-900">
                      {new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(stats.nextActionAt)}
                    </strong>
                    {stats.nextActionTitle && (
                      <span className="text-slate-500">— {stats.nextActionTitle}</span>
                    )}
                  </span>
                ) : (
                  <span className="text-slate-400 italic">Sonraki aksiyon planlanmamış</span>
                )}
              </div>
            </div>

            {/* 5'li aksiyon butonları (prominent) */}
            <div className="flex flex-wrap gap-2">
              {phoneHref && (
                <a
                  href={phoneHref}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
                >
                  <Phone className="h-4 w-4" />
                  ARA
                </a>
              )}
              {waHref && (
                <a
                  href={waHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-green-700"
                >
                  <MessageCircle className="h-4 w-4" />
                  WhatsApp
                </a>
              )}
              <CustomerRowActions
                customerId={customer.id}
                phone={customer.phone}
                whatsapp={customer.whatsapp}
              />
              <Link href={`/customers/${customer.id}/edit`}>
                <Button variant="secondary">Düzenle</Button>
              </Link>
              <CustomerDeleteButton customerId={customer.id} />
            </div>

            {/* ── Çağrı Sonu Outcome Chips (Phase 95c) ──────────────────── */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
              <OutcomeChips customerId={customer.id} />
            </div>
          </div>
        </Card>

        {/* ── Quick Stats şeridi (6 KPI) ──────────────────────────────── */}
        {(marketplaceStats || stats) && (
          <Card className="p-4">
            <div className="grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
              <StatChip
                label="Toplam Ciro"
                value={marketplaceStats ? new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(marketplaceStats.totalRevenueTry) : "—"}
                tone="success"
              />
              <StatChip
                label="Sipariş Adedi"
                value={String(marketplaceStats?.totalOrders ?? 0)}
                tone="info"
              />
              <StatChip
                label="Farklı Ürün"
                value={String(marketplaceStats?.uniqueProducts ?? 0)}
                tone="neutral"
              />
              <StatChip
                label="Aktif İlgi"
                value={String(stats?.activeInterestsCount ?? 0)}
                tone={stats && stats.activeInterestsCount > 0 ? "warning" : "neutral"}
              />
              <StatChip
                label="Açık Teklif"
                value={String(stats?.openQuoteCount ?? 0)}
                tone={stats && stats.openQuoteCount > 0 ? "info" : "neutral"}
              />
              <StatChip
                label="Müşterilik"
                value={(() => {
                  const months = Math.max(0, Math.floor((Date.now() - new Date(customer.createdAt).getTime()) / (30 * 24 * 60 * 60 * 1000)));
                  if (months < 12) return `${months} ay`;
                  const years = Math.floor(months / 12);
                  const remainder = months % 12;
                  return remainder === 0 ? `${years} yıl` : `${years}y ${remainder}a`;
                })()}
                tone="neutral"
              />
            </div>
          </Card>
        )}

        {/* ── ÇAĞRI SIRASINDA BİLMEM GEREKENLER ─────────────────────── */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-100">
                <Heart className="h-3.5 w-3.5 text-rose-700" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Ne Almak İstiyor?</h3>
                <p className="text-[10px] text-slate-500">Aktif ilgileri + aradığı özellikler</p>
              </div>
            </div>
            {customer.interests.length === 0 && customer.categoryInterests.length === 0 && customer.attributeInterests.length === 0 ? (
              <p className="py-4 text-center text-xs text-slate-400">Henüz ilgi alanı kaydedilmedi.</p>
            ) : (
              <div className="space-y-3">
                {customer.interests.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                      ⚡ Ürün İlgileri ({customer.interests.length})
                    </p>
                    <ul className="space-y-1">
                      {customer.interests.slice(0, 4).map((i) => (
                        <li key={i.id} className="text-xs">
                          <Link href={`/products/${i.product.id}`} className="font-medium text-slate-800 hover:text-slate-600">
                            {i.product.name}
                          </Link>
                          {i.quantity > 1 && <span className="ml-1 text-slate-400">×{i.quantity}</span>}
                          {i.stage && (
                            <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[9px] text-slate-600">{i.stage}</span>
                          )}
                        </li>
                      ))}
                      {customer.interests.length > 4 && (
                        <li className="text-[10px] text-slate-400">+ {customer.interests.length - 4} daha</li>
                      )}
                    </ul>
                  </div>
                )}
                {customer.categoryInterests.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                      🏷️ Kategori İlgileri
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {customer.categoryInterests.map((ci) => (
                        <Link
                          key={ci.id}
                          href={`/categories/${ci.category.id}`}
                          className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700 hover:bg-slate-200"
                        >
                          {ci.category.name}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
                {customer.attributeInterests.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                      🔍 Aradığı Özellikler
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {customer.attributeInterests.map((ai) => (
                        <span
                          key={ai.attributeId}
                          className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700"
                        >
                          ✓ {ai.attribute.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100">
                <ShoppingBag className="h-3.5 w-3.5 text-blue-700" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Pazaryeri Geçmişi</h3>
                <p className="text-[10px] text-slate-500">Lifetime sipariş + kanal dağılımı</p>
              </div>
            </div>
            {!marketplaceStats || marketplaceStats.totalOrders === 0 ? (
              <p className="py-4 text-center text-xs text-slate-400">Pazaryeri satış kaydı yok.</p>
            ) : (
              <div>
                <div className="text-center mb-3">
                  <p className="text-2xl font-bold tabular-nums text-emerald-700">
                    {new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(marketplaceStats.totalRevenueTry)}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {marketplaceStats.totalOrders} sipariş · {marketplaceStats.uniqueProducts} farklı ürün
                  </p>
                </div>
                <div className="space-y-1.5">
                  {marketplaceStats.channels.slice(0, 5).map((c) => {
                    const pct = marketplaceStats.totalRevenueTry > 0 ? (c.revenueTry / marketplaceStats.totalRevenueTry) * 100 : 0;
                    return (
                      <div key={c.channel} className="flex items-center justify-between text-xs">
                        <span className="font-medium text-slate-700">{c.channel}</span>
                        <span className="flex items-center gap-2">
                          <span className="text-slate-500">{c.orders} sip.</span>
                          <span className="font-mono font-semibold text-slate-800">
                            {new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(c.revenueTry)}
                          </span>
                          <span className="text-[10px] text-slate-400 w-9 text-right">%{pct.toFixed(0)}</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </Card>
        </div>

        <CustomerWorkspaceTabs
        defaultTabId="overview"
        tabs={[
          {
            id: "overview",
            label: "Genel Bilgiler",
            hint: "Müşteri özeti ve CRM kaydı",
            content: (
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_360px]">
                <Card className="p-6">
                  <h2 className="text-lg font-semibold text-slate-950">Müşteri bilgileri</h2>
                  <dl className="mt-5 grid gap-4 sm:grid-cols-2">
                    <Info label="Telefon" value={customer.phone} />
                    <Info label="WhatsApp" value={customer.whatsapp} />
                    <Info label="E-posta" value={customer.email} />
                    <Info label="Vergi no" value={customer.taxNumber} />
                    <Info label="İl" value={customer.city} />
                    <Info label="İlçe" value={customer.district} />
                    <Info label="Müşteri kaynağı" value={customer.source} />
                    <Info label="Müşteri sahibi" value={customer.owner?.name} />
                  </dl>
                  <div className="mt-6 grid gap-4">
                    <InfoBlock label="Adres" value={customer.address} />
                    <InfoBlock label="CRM notu" value={customer.customerNotes} />
                  </div>
                </Card>

                <div className="space-y-4">
                  <Card className="p-6">
                    <h2 className="text-lg font-semibold text-slate-950">Kayıt metrikleri</h2>
                    <dl className="mt-5 space-y-4">
                      <Info label="Oluşturulma" value={formatDateTime(customer.createdAt)} />
                      <Info label="Güncellenme" value={formatDateTime(customer.updatedAt)} />
                      {customer.lastContactedAt ? (
                        <Info label="Son iletişim" value={formatDateTime(customer.lastContactedAt)} />
                      ) : null}
                    </dl>
                  </Card>

                  {allAttributes.length > 0 ? (
                    <Card className="p-6">
                      <h2 className="text-lg font-semibold text-slate-950">İlgi alanları</h2>
                      <p className="mt-2 text-sm leading-7 text-slate-600">
                        Kampanya eşleşmelerinde kullanılan özellik tercihleri.
                      </p>
                      <div className="mt-5">
                        <CustomerAttributeSection
                          customerId={customer.id}
                          allAttributes={allAttributes}
                          initialAttributeIds={customer.attributeInterests.map((ai) => ai.attributeId)}
                        />
                      </div>
                    </Card>
                  ) : null}
                </div>
              </div>
            ),
          },
          {
            id: "interests",
            label: "İlgi Alanları",
            hint: "Ürün ve kategori takibi",
            content: (
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                <Card className="p-6">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-semibold text-slate-950">Ürün ilgileri</h2>
                      <p className="mt-2 text-sm leading-7 text-slate-600">
                        Müşterinin ilgilendiği ürünleri ve teklif sürecini takip edin.
                      </p>
                    </div>
                    <Badge>{customer.interests.length} kayıt</Badge>
                  </div>

                  <div className="mt-6">
                    <CustomerInterestForm
                      customerId={customer.id}
                      products={productOptionsResult.products}
                    />
                  </div>

                  <div className="mt-8 space-y-4">
                    {customer.interests.length === 0 ? (
                      <p className="text-sm text-slate-500">Henüz ürün ilgisi eklenmedi.</p>
                    ) : (
                      customer.interests.map((interest) => (
                        <div
                          key={interest.id}
                          className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                        >
                          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                            <div>
                              <p className="font-semibold text-slate-900">
                                {interest.product.name} ({interest.product.sku})
                              </p>
                              <p className="mt-1 text-sm text-slate-600">
                                Miktar: {interest.quantity}
                                {interest.quotedPrice
                                  ? ` | Teklif: ${interest.quotedPrice.toString()} ${interest.currency}`
                                  : ""}
                              </p>
                              {interest.interestNotes ? (
                                <p className="mt-3 text-sm leading-7 text-slate-600">
                                  {interest.interestNotes}
                                </p>
                              ) : null}
                            </div>

                            <div className="flex flex-col items-start gap-3 md:items-end">
                              <Badge tone={getInterestStageTone(interest.stage)}>
                                {formatInterestStage(interest.stage)}
                              </Badge>
                              <CustomerInterestDeleteButton
                                customerId={customer.id}
                                interestId={interest.id}
                              />
                            </div>
                          </div>
                          <p className="mt-4 text-xs uppercase tracking-[0.25em] text-slate-400">
                            {formatDateTime(interest.createdAt)}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </Card>

                <Card className="p-6">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-semibold text-slate-950">Kategori ilgileri</h2>
                      <p className="mt-2 text-sm leading-7 text-slate-600">
                        Ürün kategori eğilimini satış fırsatlarıyla birlikte izleyin.
                      </p>
                    </div>
                    <Badge>{customer.categoryInterests.length} kayıt</Badge>
                  </div>

                  <div className="mt-6">
                    <CategoryInterestForm
                      customerId={customer.id}
                      categories={categoryOptionsResult.categories}
                    />
                  </div>

                  <div className="mt-8 space-y-4">
                    {customer.categoryInterests.length === 0 ? (
                      <p className="text-sm text-slate-500">Henüz kategori ilgisi eklenmedi.</p>
                    ) : (
                      customer.categoryInterests.map((ci) => (
                        <div
                          key={ci.id}
                          className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                        >
                          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                            <div>
                              <Link
                                href={`/categories/${ci.category.id}`}
                                className="font-semibold text-slate-900 hover:text-[color:var(--accent)]"
                              >
                                {ci.category.name}
                              </Link>
                              {ci.notes ? (
                                <p className="mt-2 text-sm leading-7 text-slate-600">{ci.notes}</p>
                              ) : null}
                              <p className="mt-3 text-xs uppercase tracking-[0.25em] text-slate-400">
                                {formatDateTime(ci.createdAt)}
                              </p>
                            </div>
                            <div className="flex flex-col items-start gap-3 md:items-end">
                              <Badge tone={getInterestStageTone(ci.stage)}>
                                {formatInterestStage(ci.stage)}
                              </Badge>
                              <CategoryInterestDeleteButton
                                customerId={customer.id}
                                interestId={ci.id}
                              />
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </Card>
              </div>
            ),
          },
          {
            id: "quotes",
            label: "Teklifler",
            hint: "Builder ve teklif geçmişi",
            content: (
              <div className="space-y-4">
                <Card className="p-6">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                        Teklif stüdyosu
                      </p>
                      <h2 className="mt-2 text-2xl font-semibold text-slate-950">
                        Bu müşteri için profesyonel teklif hazırla
                      </h2>
                      <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
                        Quote builder tam genişlikte çalışır. Sağ tarafta canlı toplam özeti yer alır,
                        geçmiş teklifler ise üretim alanını sıkıştırmadan aşağıda listelenir.
                      </p>
                    </div>
                    <Badge>{customer.quotes.length} teklif</Badge>
                  </div>

                  <div className="mt-6">
                    <QuoteForm
                      customerId={customer.id}
                      customerName={customer.name}
                      customerCompany={customer.company}
                      products={productOptionsResult.products.map((p) => ({
                        id: p.id,
                        name: p.name,
                        sku: p.sku ?? "",
                        sellingPriceTry: p.sellingPriceTry ? Number(p.sellingPriceTry) : null,
                      }))}
                      templates={quoteTemplates.map((t) => ({
                        id: t.id,
                        name: t.name,
                        description: t.description,
                        paymentTerms: t.paymentTerms,
                        deliveryTerms: t.deliveryTerms,
                        warrantyTerms: t.warrantyTerms,
                        notes: t.notes,
                        items: t.items.map((item) => ({
                          description: item.description,
                          quantity: item.quantity,
                          unitPrice: Number(item.unitPrice),
                          currency: item.currency,
                          discount: Number(item.discount),
                          tax: Number(item.tax),
                          productId: item.productId,
                        })),
                      }))}
                    />
                  </div>
                </Card>

                <Card className="overflow-hidden">
                  <div className="border-b border-slate-200 px-6 py-5">
                    <h3 className="text-lg font-semibold text-slate-950">Teklif geçmişi</h3>
                    <p className="mt-2 text-sm leading-7 text-slate-600">
                      Önceki teklifleri açın, PDF olarak inceleyin veya WhatsApp ile tekrar paylaşın.
                    </p>
                  </div>

                  {customer.quotes.length === 0 ? (
                    <div className="px-6 py-8 text-sm text-slate-500">
                      Henüz teklif oluşturulmadı.
                    </div>
                  ) : (
                    <div className="space-y-4 px-6 py-6">
                      {customer.quotes.map((quote) => {
                        const totalDisplay = formatDisplayPair(
                          resolveDisplayAmounts(
                            Number(quote.total),
                            quote.items[0]?.currency ?? "TRY",
                            quote.currencyMode ?? "TRY",
                            quote.exchangeRate != null ? Number(quote.exchangeRate) : null,
                          ),
                        );

                        return (
                          <div
                            key={quote.id}
                            className="rounded-3xl border border-slate-200 bg-slate-50 p-5"
                          >
                            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                              <div className="grid gap-4 md:grid-cols-3 xl:flex-1">
                                <HistoryMetric label="Teklif no" value={quote.quoteNumber} />
                                <HistoryMetric label="Toplam" value={totalDisplay} />
                                <HistoryMetric
                                  label="Tarih"
                                  value={formatDateTime(quote.createdAt)}
                                />
                              </div>

                              <div className="flex flex-col gap-3 xl:items-end">
                                <Badge tone={getQuoteStatusTone(quote.status)}>
                                  {formatQuoteStatus(quote.status)}
                                </Badge>
                                <div className="flex flex-wrap gap-2">
                                  <Link href={`/quotes/${quote.id}`}>
                                    <Button variant="secondary">Aç</Button>
                                  </Link>
                                  <a href={`/quotes/${quote.id}/pdf`} target="_blank" rel="noreferrer">
                                    <Button variant="ghost">PDF</Button>
                                  </a>
                                  <QuoteWhatsAppButton
                                    quoteId={quote.id}
                                    phone={customer.whatsapp ?? customer.phone}
                                    customerName={customer.name}
                                    quoteNumber={quote.quoteNumber}
                                    totalDisplay={totalDisplay}
                                    validityDate={quote.validityDate}
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Card>
              </div>
            ),
          },
          {
            id: "timeline",
            label: "Notlar ve Görevler",
            hint: "Yeni not + görev ekle (tam timeline aşağıda)",
            content: (
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <Card className="p-6">
                  <h2 className="text-lg font-semibold text-slate-950">Yeni not ekle</h2>
                  <p className="mt-2 text-sm leading-7 text-slate-600">
                    Birleşik zaman çizelgesi (tüm notlar + görevler + teklifler + siparişler) sayfanın altında.
                  </p>

                  <div className="mt-6">
                    <CustomerNoteForm customerId={customer.id} />
                  </div>

                  <div className="mt-4 rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-900">
                    💡 Eklediğin not + diğer tüm olaylar (görevler, teklifler, siparişler) sayfanın altındaki <strong>Zaman Çizelgesi</strong> bölümünde görünür.
                  </div>
                </Card>

                <Card className="p-6">
                  <h2 className="text-lg font-semibold text-slate-950">Takip görevleri</h2>
                  <p className="mt-2 text-sm leading-7 text-slate-600">
                    Açık takip kayıtlarını planlayın ve tamamlandığında kapatın.
                  </p>

                  <div className="mt-6">
                    <CustomerTaskForm
                      customerId={customer.id}
                      users={taskUsers}
                      canAssign={canAssign}
                    />
                  </div>

                  <div className="mt-8 space-y-4">
                    {customer.tasks.length === 0 ? (
                      <p className="text-sm text-slate-500">Açık takip görevi bulunmuyor.</p>
                    ) : (
                      customer.tasks.map((task) => {
                        const isOverdue =
                          task.status === "OPEN" &&
                          !!task.dueDate &&
                          task.dueDate.getTime() < now;

                        return (
                          <div
                            key={task.id}
                            className={`rounded-2xl border p-4 ${
                              isOverdue
                                ? "border-red-200 bg-red-50"
                                : "border-slate-200 bg-slate-50"
                            }`}
                          >
                            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                              <div>
                                <p className="font-semibold text-slate-900">{task.title}</p>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  <Badge tone={getTaskStatusTone(task.status)}>
                                    {formatTaskStatus(task.status)}
                                  </Badge>
                                  <Badge tone={getTaskPriorityTone(task.priority)}>
                                    {formatTaskPriority(task.priority)}
                                  </Badge>
                                  {isOverdue ? <Badge tone="danger">Gecikmiş</Badge> : null}
                                </div>
                                {task.description ? (
                                  <p className="mt-3 text-sm leading-7 text-slate-600">
                                    {task.description}
                                  </p>
                                ) : null}
                                <p className="mt-3 text-xs uppercase tracking-[0.25em] text-slate-400">
                                  {task.dueDate
                                    ? `Termin: ${formatDateTime(task.dueDate)}`
                                    : "Termin yok"}
                                </p>
                              </div>

                              {task.status === "OPEN" ? (
                                <CustomerTaskCompleteButton
                                  customerId={customer.id}
                                  taskId={task.id}
                                />
                              ) : null}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </Card>
              </div>
            ),
          },
        ]}
      />

      {/* ── BİRLEŞİK ZAMAN ÇİZELGESİ ─────────────────────────────────── */}
      <section>
        <div className="mb-4 flex items-center gap-2">
          <ActivityIcon className="h-4 w-4 text-slate-600" />
          <h2 className="text-base font-semibold text-slate-900">Zaman Çizelgesi</h2>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
            {timelineEvents.length} olay
          </span>
        </div>
        <p className="mb-3 text-xs text-slate-500">
          Notlar + görevler + teklifler + pazaryeri siparişleri + ilgi alanları — hepsi tek akışta, en yenisi üstte.
        </p>
        <CustomerTimeline events={timelineEvents} />
      </section>
      </div>

      {/* ── Sticky right rail (desktop only) ───────────────────── */}
      <aside className="hidden xl:block">
        <div className="sticky top-6 space-y-4">
          {/* Contact quick info */}
          <Card className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
              İletişim
            </p>
            <div className="mt-4 space-y-3">
              <RailItem label="Telefon" value={customer.phone || "-"} />
              <RailItem label="WhatsApp" value={customer.whatsapp || "-"} />
              <RailItem label="E-posta" value={customer.email || "-"} />
              {customer.lastContactedAt ? (
                <RailItem label="Son iletişim" value={formatDateTime(customer.lastContactedAt)} />
              ) : null}
            </div>
          </Card>

          {/* Pazaryeri satış geçmişi (yeni — MarketplaceSalesRecord) */}
          {marketplaceStats && (
            <Card className="overflow-hidden p-0 border-emerald-200 bg-emerald-50/30">
              <div className="border-b border-emerald-100 bg-white/60 px-5 py-3.5">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-700">
                  Pazaryeri Satış Geçmişi
                </p>
                <p className="mt-2 text-2xl font-bold tabular-nums text-emerald-700">
                  {fmtTry(marketplaceStats.totalRevenueTry)}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {marketplaceStats.totalOrders} sipariş · {marketplaceStats.uniqueProducts} farklı ürün
                </p>
                {marketplaceStats.lastOrderDate && (
                  <p className="mt-1 text-[10px] text-slate-400">
                    Son sipariş: {formatDateTime(marketplaceStats.lastOrderDate)}
                  </p>
                )}
              </div>
              {marketplaceStats.channels.length > 0 && (
                <div className="divide-y divide-emerald-50">
                  {marketplaceStats.channels.slice(0, 5).map((c) => (
                    <div
                      key={c.channel}
                      className="flex items-center justify-between px-5 py-2 text-xs"
                    >
                      <span className="font-medium text-slate-700">
                        {CHANNEL_DISPLAY[c.channel] ?? c.channel}
                      </span>
                      <span className="font-mono text-slate-600">
                        {c.orders} · {fmtTry(c.revenueTry)}
                      </span>
                    </div>
                  ))}
                  {marketplaceStats.channels.length > 5 && (
                    <p className="px-5 py-2 text-center text-[10px] text-slate-400">
                      + {marketplaceStats.channels.length - 5} kanal daha
                    </p>
                  )}
                </div>
              )}
            </Card>
          )}

          {/* Quick actions */}
          <Card className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
              Hızlı işlemler
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <CustomerWhatsAppButton
                customerId={customer.id}
                phone={customer.whatsapp ?? customer.phone}
                customerName={customer.name}
                customerCompany={customer.company}
                customerCity={customer.city}
                lastQuoteNumber={customer.quotes[0]?.quoteNumber ?? null}
                lastContactedAt={customer.lastContactedAt}
                templates={whatsAppTemplates}
              />
              <Link href={`/customers/${customer.id}/edit`} className="w-full">
                <Button variant="secondary" className="w-full">
                  Müşteriyi düzenle
                </Button>
              </Link>
            </div>
          </Card>

          {/* Phase 96c — Ürün önerileri (kategori geçmişine göre) */}
          {productSuggestions.length > 0 && (
            <CustomerProductSuggestionsWidget
              customerId={customer.id}
              products={productSuggestions}
            />
          )}

          {/* Recent quotes */}
          <Card className="overflow-hidden">
            <div className="border-b border-slate-200 px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                Son teklifler
              </p>
              <p className="mt-1 text-lg font-semibold text-slate-950">
                {customer.quotes.length} teklif
              </p>
            </div>
            {recentQuotes.length === 0 ? (
              <p className="px-5 py-4 text-sm text-slate-500">Henüz teklif yok.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {recentQuotes.map((quote) => (
                  <Link
                    key={quote.id}
                    href={`/quotes/${quote.id}`}
                    className="block px-5 py-3 transition hover:bg-slate-50"
                  >
                    <p className="text-sm font-semibold text-slate-900">{quote.quoteNumber}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {formatDateTime(quote.createdAt)}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>
      </aside>
    </div>
  );
}

function Info({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-[0.25em] text-slate-500">{label}</dt>
      <dd className="mt-2 text-sm font-medium text-slate-900">{value || "-"}</dd>
    </div>
  );
}

function InfoBlock({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.25em] text-slate-500">{label}</p>
      <div className="mt-2 rounded-2xl bg-slate-50 p-4 text-sm leading-7 text-slate-600">
        {value || "-"}
      </div>
    </div>
  );
}

function RailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium text-slate-900">{value}</p>
    </div>
  );
}

function HistoryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-medium text-slate-900">{value}</p>
    </div>
  );
}

function StatChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "success" | "info" | "warning" | "neutral";
}) {
  const toneClass = {
    success: "text-emerald-700",
    info: "text-blue-700",
    warning: "text-amber-700",
    neutral: "text-slate-900",
  }[tone];
  return (
    <div className="border-l-2 border-slate-200 pl-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <p className={`mt-0.5 text-lg font-bold tabular-nums ${toneClass}`}>
        {value}
      </p>
    </div>
  );
}

// ── Pazaryeri satış istatistikleri (sticky rail için) ───────────────────────
// MarketplaceSalesRecord'tan müşterinin tüm kanal sipariş geçmişini özetler.
// Sadece bu müşteri için linklenmiş kayıtlar (Customer.id eşleşmesi).

interface CustomerMarketplaceStats {
  totalOrders: number;
  totalRevenueTry: number;
  channels: Array<{ channel: string; orders: number; revenueTry: number }>;
  lastOrderDate: Date | null;
  uniqueProducts: number;
}

async function fetchCustomerMarketplaceStats(
  customerId: string,
): Promise<CustomerMarketplaceStats | null> {
  try {
    const records = await prisma.marketplaceSalesRecord.findMany({
      where: {
        customerId,
        NOT: [
          { status: { contains: "iptal", mode: "insensitive" } },
          { status: { contains: "iade", mode: "insensitive" } },
        ],
      },
      select: {
        channel: true,
        orderNumber: true,
        orderDate: true,
        productId: true,
        totalAmountTry: true,
      },
    });

    if (records.length === 0) return null;

    const channelMap = new Map<string, { orders: Set<string>; revenue: number }>();
    const productIds = new Set<string>();
    let totalRevenue = 0;
    let lastOrderDate: Date | null = null;
    const allOrderNumbers = new Set<string>();

    for (const r of records) {
      allOrderNumbers.add(r.orderNumber);
      if (r.productId) productIds.add(r.productId);
      const rev = r.totalAmountTry ? Number(r.totalAmountTry) : 0;
      totalRevenue += rev;
      if (!lastOrderDate || r.orderDate > lastOrderDate) lastOrderDate = r.orderDate;

      const c = channelMap.get(r.channel) ?? { orders: new Set(), revenue: 0 };
      c.orders.add(r.orderNumber);
      c.revenue += rev;
      channelMap.set(r.channel, c);
    }

    const channels = [...channelMap.entries()]
      .map(([ch, v]) => ({ channel: ch, orders: v.orders.size, revenueTry: v.revenue }))
      .sort((a, b) => b.orders - a.orders);

    return {
      totalOrders: allOrderNumbers.size,
      totalRevenueTry: totalRevenue,
      channels,
      lastOrderDate,
      uniqueProducts: productIds.size,
    };
  } catch {
    return null;
  }
}

function fmtTry(n: number): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  }).format(n);
}

const CHANNEL_DISPLAY: Record<string, string> = {
  TRENDYOL: "Trendyol",
  HEPSIBURADA: "Hepsiburada",
  N11: "N11",
  IDEASOFT: "Ideasoft",
  GG: "GittiGidiyor",
  PAZARAMA: "Pazarama",
  EPTT: "EPTT",
  MIRAKL_KOCTAS: "Koçtaş",
  IDEFIX: "İdefix",
  AMAZON: "Amazon",
  CICEKSEPETI: "Çiçeksepeti",
  TEMU: "Temu",
  MIRAKL_TEKNOSA: "Teknosa",
  SHOPPHP: "ShopPHP",
  MANUAL: "Manuel",
};
