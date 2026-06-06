import Link from "next/link";
import { notFound } from "next/navigation";

import { CustomerWorkspaceTabs } from "@/components/customers/customer-workspace-tabs";
import { CustomerAttributeSection } from "@/components/customers/customer-attribute-section";
import { CategoryInterestDeleteButton } from "@/components/categories/category-interest-delete-button";
import { CategoryInterestForm } from "@/components/categories/category-interest-form";
import { CustomerDeleteButton } from "@/components/customers/customer-delete-button";
import { CustomerWhatsAppButton } from "@/components/customers/customer-whatsapp-button";
import { CatalogModal } from "@/components/customers/catalog-modal";
import { listCatalogProfiles, getCatalogProfile } from "@/lib/catalog-mapping";
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
import { MetricCard, type MetricStatus } from "@/components/ui/metric-card";
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
import { Phone, Mail, MapPin, Briefcase, Clock, Target, Heart, ShoppingBag, Activity as ActivityIcon, PhoneOff, Sparkles, Zap, Tag, Search, Check, Lightbulb, DollarSign, Package, FileText as FileTextIcon } from "lucide-react";
import { CustomerRowActions } from "@/components/customers/customer-row-actions";
import { CustomerTimeline } from "@/components/customers/customer-timeline";
import { OutcomeChips } from "@/components/customers/outcome-chips";
import { InlineStatusEditor } from "@/components/customers/inline-status-editor";
import { CustomerAvatar } from "@/components/customers/customer-avatar";
import { prisma } from "@/lib/prisma";
import { shortenCustomerName } from "@/lib/display-helpers";
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
  const [
    { databaseAvailable, customer },
    productOptionsResult,
    categoryOptionsResult,
    allAttributes,
    quoteTemplates,
    taskUsers,
    marketplaceStats,
    statsMap,
    timelineEvents,
    whatsAppTemplates,
    productSuggestions,
    canCreateCatalog,
    canWholesale,
    catalogBrands,
  ] = await Promise.all([
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
    checkPermission(currentUser, PERMISSIONS.CATALOGS_CREATE),
    checkPermission(currentUser, PERMISSIONS.CATALOGS_WHOLESALE_MODE),
    prisma.product
      .findMany({
        where: { isActive: true, brand: { not: null } },
        select: { brand: true },
        distinct: ["brand"],
        orderBy: { brand: "asc" },
      })
      .catch(() => [] as Array<{ brand: string | null }>),
  ]);
  const stats = statsMap.get(id) ?? null;

  if (!databaseAvailable) {
    return (
      <div className="space-y-6">
        <div>
          <Link
            href="/customers"
            className="inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            ← Müşteriler
          </Link>
          <h1 className="mt-3 text-[22px] font-semibold tracking-tight text-[var(--text-primary)]">
            Müşteri detayı geçici olarak kullanılamıyor
          </h1>
          <p className="mt-2 text-[13px] leading-6 text-[var(--text-secondary)]">
            Veritabanı bağlantısı şu anda kullanılamıyor. Bağlantı geri geldiğinde müşteri
            detayları tekrar yüklenecek.
          </p>
        </div>

        <Card className="p-6 text-[13px] leading-6 text-[var(--warn)] border-[var(--warn-border)] bg-[var(--warn-dim)]">
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
    success: "bg-[var(--ok-dim)] text-[var(--ok)] border-[var(--ok-border)]",
    info: "bg-[var(--info-dim)] text-[var(--info)] border-[var(--info-border)]",
    warning: "bg-[var(--warn-dim)] text-[var(--warn)] border-[var(--warn-border)]",
    neutral: "bg-[var(--surface-3)] text-[var(--text-secondary)] border-[var(--border-default)]",
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
          className="inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
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
                  className={`flex h-16 w-16 flex-shrink-0 flex-col items-center justify-center rounded-lg border ${SCORE_BG_HERO[leadScore.tone]}`}
                  title={`Lead Skoru ${leadScore.score}/100 — ${leadScore.label}`}
                >
                  <span className="text-2xl font-semibold tabular-nums leading-none">{leadScore.score}</span>
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
                    <Badge variant="neutral">
                      {CUSTOMER_TYPE_LABELS[customer.customerType]}
                    </Badge>
                  )}
                  {customer.doNotCall && (
                    <Badge variant="danger" className="gap-1">
                      <PhoneOff size={14} strokeWidth={1.5} />
                      DND
                    </Badge>
                  )}
                  {customer.tags && customer.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1" title={customer.tags.join(", ")}>
                      {customer.tags.slice(0, 3).map((tag) => (
                        <Badge key={tag} variant="info">
                          {tag}
                        </Badge>
                      ))}
                      {customer.tags.length > 3 && (
                        <Badge variant="neutral">
                          +{customer.tags.length - 3}
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
                <h1 className="mt-2 text-[22px] font-semibold tracking-tight text-[var(--text-primary)]" title={customer.name}>
                  {shortenCustomerName(customer.name, 70)}
                </h1>
                {customer.company && customer.company.trim() !== customer.name.trim() ? (
                  <p className="mt-1 text-[13px] text-[var(--text-secondary)]">{shortenCustomerName(customer.company, 80)}</p>
                ) : (
                  <p className="mt-1 text-[13px] text-[var(--text-muted)] italic">Firma belirtilmedi</p>
                )}

                {/* İletişim satırı */}
                <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13px] text-[var(--text-secondary)]">
                  {phoneDisplay && phoneHref && (
                    <a href={phoneHref} className="flex items-center gap-1.5 font-mono hover:text-[var(--ok)] transition-colors">
                      <Phone size={14} strokeWidth={1.5} className="text-[var(--ok)]" />
                      <span className="font-medium text-[var(--text-primary)]">{phoneDisplay}</span>
                    </a>
                  )}
                  {customer.email && (
                    <a href={`mailto:${customer.email}`} className="flex items-center gap-1.5 hover:text-[var(--info)] transition-colors">
                      <Mail size={14} strokeWidth={1.5} className="text-[var(--text-muted)]" />
                      {customer.email}
                    </a>
                  )}
                  {customer.city && (
                    <span className="flex items-center gap-1.5">
                      <MapPin size={14} strokeWidth={1.5} className="text-[var(--text-muted)]" />
                      {[customer.district, customer.city].filter(Boolean).join(" / ")}
                    </span>
                  )}
                  {customer.taxNumber && (
                    <span className="flex items-center gap-1.5">
                      <Briefcase size={14} strokeWidth={1.5} className="text-[var(--text-muted)]" />
                      VN: <span className="font-mono">{customer.taxNumber}</span>
                      {customer.taxOffice && <span className="text-[var(--text-muted)]">({customer.taxOffice})</span>}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Son temas + Sonraki aksiyon — kritik bant */}
            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-3)] px-4 py-3 text-[13px]">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5">
                <span className="flex items-center gap-1.5 text-[var(--text-secondary)]">
                  <Clock size={14} strokeWidth={1.5} className="text-[var(--text-muted)]" />
                  Son temas: <strong className="text-[var(--text-primary)] font-semibold">{relTime(customer.lastContactedAt)}</strong>
                </span>
                {stats?.nextActionAt ? (
                  <span className="flex items-center gap-1.5 text-[var(--text-secondary)]">
                    <Target size={14} strokeWidth={1.5} className="text-[var(--warn)]" />
                    Sonraki:{" "}
                    <strong className="text-[var(--text-primary)] font-semibold">
                      {new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(stats.nextActionAt)}
                    </strong>
                    {stats.nextActionTitle && (
                      <span className="text-[var(--text-muted)]">— {stats.nextActionTitle}</span>
                    )}
                  </span>
                ) : (
                  <span className="text-[var(--text-muted)] italic">Sonraki aksiyon planlanmamış</span>
                )}
              </div>
            </div>

            {/* Aksiyon butonları — tek sıra, duplicate yok (P0)
                ARA + WhatsApp (template dropdown'lı) + Not + Görev + Düzenle */}
            <div className="flex flex-wrap items-center gap-2">
              {phoneHref && (
                <a
                  href={phoneHref}
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-[var(--accent)] px-3.5 text-[13px] font-medium text-[var(--accent-fg)] transition-all duration-100 hover:brightness-110 active:scale-[0.98]"
                >
                  <Phone size={14} strokeWidth={1.5} />
                  ARA
                </a>
              )}
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
              {canCreateCatalog && (
                <CatalogModal
                  customerId={customer.id}
                  customerName={customer.name}
                  customerCompany={customer.company}
                  customerPhone={customer.phone}
                  customerWhatsapp={customer.whatsapp}
                  customerIndustrySlug={customer.industry?.slug ?? null}
                  profiles={listCatalogProfiles().map((p) => ({
                    slug: p.slug,
                    title: p.title,
                    subtitle: p.subtitle,
                    defaultPriceMode: p.defaultPriceMode,
                  }))}
                  canWholesale={canWholesale}
                  brands={catalogBrands.map((b) => b.brand!).filter(Boolean)}
                  defaultProfileSlug={
                    getCatalogProfile(customer.industry?.slug).slug
                  }
                />
              )}
              <CustomerRowActions
                customerId={customer.id}
                phone={customer.phone}
                whatsapp={customer.whatsapp}
                compact
              />
              <Link href={`/customers/${customer.id}/edit`}>
                <Button variant="secondary">Düzenle</Button>
              </Link>
            </div>

            {/* ── Çağrı Sonu Outcome Chips (Phase 95c) ──────────────────── */}
            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-3)] p-4">
              <OutcomeChips customerId={customer.id} />
            </div>

            {/* P2 — Sektör & Teknoloji compact strip (çağrı sırasında hızla görsel referans) */}
            {(customer.industry || customer.usedTech?.length || customer.currentSupplier) && (
              <div className="rounded-lg border border-[var(--info-border)] bg-[var(--info-dim)] px-4 py-3">
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]">
                  {customer.industry && (
                    <span className="flex items-center gap-1.5">
                      <span className="text-[11px] font-medium text-[var(--info)] uppercase tracking-widest">Sektör</span>
                      <span className="font-medium text-[var(--text-primary)]">
                        {customer.industry.parent?.name ? `${customer.industry.parent.name} → ` : ""}
                        {customer.industry.name}
                      </span>
                    </span>
                  )}
                  {customer.usedTech?.length > 0 && (
                    <span className="flex items-center gap-1.5">
                      <span className="text-[11px] font-medium text-[var(--info)] uppercase tracking-widest">Teknoloji</span>
                      <span className="flex flex-wrap gap-1">
                        {customer.usedTech.map((tech) => (
                          <span
                            key={tech}
                            className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--info)] border border-[var(--info-border)]"
                          >
                            {tech}
                          </span>
                        ))}
                      </span>
                    </span>
                  )}
                  {customer.currentSupplier && (
                    <span className="flex items-center gap-1.5">
                      <span className="text-[11px] font-medium text-[var(--warn)] uppercase tracking-widest">Rakip</span>
                      <span className="font-medium text-[var(--warn)]">{customer.currentSupplier}</span>
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* ── Quick Stats şeridi — P0: 0'lı chip'leri gizle, hiç veri yoksa "Yeni müşteri" rozet ── */}
        {(() => {
          const totalRevenue = marketplaceStats?.totalRevenueTry ?? 0;
          const totalOrders = marketplaceStats?.totalOrders ?? 0;
          const uniqueProducts = marketplaceStats?.uniqueProducts ?? 0;
          const activeInterests = stats?.activeInterestsCount ?? 0;
          const openQuotes = stats?.openQuoteCount ?? 0;
          const monthsTotal = Math.max(0, Math.floor((Date.now() - new Date(customer.createdAt).getTime()) / (30 * 24 * 60 * 60 * 1000)));

          const visibleChips: Array<{ label: string; value: string; status: MetricStatus; icon: typeof DollarSign }> = [];
          if (totalRevenue > 0) {
            visibleChips.push({
              label: "Toplam Ciro",
              value: new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(totalRevenue),
              status: "ok",
              icon: DollarSign,
            });
          }
          if (totalOrders > 0) visibleChips.push({ label: "Sipariş Adedi", value: String(totalOrders), status: "info", icon: ShoppingBag });
          if (uniqueProducts > 0) visibleChips.push({ label: "Farklı Ürün", value: String(uniqueProducts), status: "neutral", icon: Package });
          if (activeInterests > 0) visibleChips.push({ label: "Aktif İlgi", value: String(activeInterests), status: "warn", icon: Heart });
          if (openQuotes > 0) visibleChips.push({ label: "Açık Teklif", value: String(openQuotes), status: "info", icon: FileTextIcon });

          // Müşterilik süresi — sadece >0 ay ise göster
          if (monthsTotal > 0) {
            const value = monthsTotal < 12
              ? `${monthsTotal} ay`
              : (() => {
                  const years = Math.floor(monthsTotal / 12);
                  const remainder = monthsTotal % 12;
                  return remainder === 0 ? `${years} yıl` : `${years}y ${remainder}a`;
                })();
            visibleChips.push({ label: "Müşterilik", value, status: "neutral", icon: Clock });
          }

          if (visibleChips.length === 0) {
            return (
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <Badge variant="info" className="gap-1">
                    <Sparkles size={14} strokeWidth={1.5} />
                    Yeni müşteri
                  </Badge>
                  <span className="text-[12px] text-[var(--text-muted)]">
                    Henüz satış geçmişi yok — ilk çağrıyı yap, ilgi alanlarını kaydet.
                  </span>
                </div>
              </Card>
            );
          }

          return (
            <div className={`grid grid-cols-2 gap-3 sm:grid-cols-3 ${visibleChips.length >= 4 ? "lg:grid-cols-6" : "lg:grid-cols-3"}`}>
              {visibleChips.map((chip) => (
                <MetricCard
                  key={chip.label}
                  label={chip.label}
                  value={chip.value}
                  status={chip.status}
                  icon={chip.icon}
                />
              ))}
            </div>
          );
        })()}

        {/* ── ÇAĞRI SIRASINDA BİLMEM GEREKENLER ─────────────────────── */}
        {/* P6/CD2-03: Boş "Ne Almak İstiyor?" + "Pazaryeri Geçmişi" kartlarını gizle */}
        {(customer.interests.length > 0 || customer.categoryInterests.length > 0 || customer.attributeInterests.length > 0 || (marketplaceStats && marketplaceStats.totalOrders > 0)) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {(customer.interests.length > 0 || customer.categoryInterests.length > 0 || customer.attributeInterests.length > 0) && (
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--danger-dim)] border border-[var(--danger-border)]">
                <Heart size={14} strokeWidth={1.5} className="text-[var(--danger)]" />
              </div>
              <div>
                <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">Ne Almak İstiyor?</h3>
                <p className="text-[11px] text-[var(--text-muted)]">Aktif ilgileri + aradığı özellikler</p>
              </div>
            </div>
              <div className="space-y-3">
                {customer.interests.length > 0 && (
                  <div>
                    <p className="inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)] mb-1.5">
                      <Zap size={14} strokeWidth={1.5} />
                      Ürün İlgileri ({customer.interests.length})
                    </p>
                    <ul className="space-y-1">
                      {customer.interests.slice(0, 4).map((i) => (
                        <li key={i.id} className="text-[12px]">
                          <Link href={`/products/${i.product.id}`} className="font-medium text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors">
                            {i.product.name}
                          </Link>
                          {i.quantity > 1 && <span className="ml-1 text-[var(--text-muted)]">×{i.quantity}</span>}
                          {i.stage && (
                            <span className="ml-2 rounded bg-[var(--surface-3)] border border-[var(--border-subtle)] px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)]">{i.stage}</span>
                          )}
                        </li>
                      ))}
                      {customer.interests.length > 4 && (
                        <li className="text-[11px] text-[var(--text-muted)]">+ {customer.interests.length - 4} daha</li>
                      )}
                    </ul>
                  </div>
                )}
                {customer.categoryInterests.length > 0 && (
                  <div>
                    <p className="inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)] mb-1.5">
                      <Tag size={14} strokeWidth={1.5} />
                      Kategori İlgileri
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {customer.categoryInterests.map((ci) => (
                        <Link
                          key={ci.id}
                          href={`/categories/${ci.category.id}`}
                          className="rounded bg-[var(--surface-3)] border border-[var(--border-subtle)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] transition-colors"
                        >
                          {ci.category.name}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
                {customer.attributeInterests.length > 0 && (
                  <div>
                    <p className="inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)] mb-1.5">
                      <Search size={14} strokeWidth={1.5} />
                      Aradığı Özellikler
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {customer.attributeInterests.map((ai) => (
                        <Badge key={ai.attributeId} variant="ok" className="gap-1">
                          <Check size={14} strokeWidth={1.5} />
                          {ai.attribute.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
          </Card>
          )}

          {marketplaceStats && marketplaceStats.totalOrders > 0 && (
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--info-dim)] border border-[var(--info-border)]">
                <ShoppingBag size={14} strokeWidth={1.5} className="text-[var(--info)]" />
              </div>
              <div>
                <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">Pazaryeri Geçmişi</h3>
                <p className="text-[11px] text-[var(--text-muted)]">Lifetime sipariş + kanal dağılımı</p>
              </div>
            </div>
            <div>
              <div className="text-center mb-3">
                <p className="text-2xl font-semibold tabular-nums text-[var(--ok)]">
                  {new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(marketplaceStats.totalRevenueTry)}
                </p>
                <p className="text-[11px] text-[var(--text-muted)]">
                  {marketplaceStats.totalOrders} sipariş · {marketplaceStats.uniqueProducts} farklı ürün
                </p>
              </div>
              <div className="space-y-1.5">
                {marketplaceStats.channels.slice(0, 5).map((c) => {
                  const pct = marketplaceStats.totalRevenueTry > 0 ? (c.revenueTry / marketplaceStats.totalRevenueTry) * 100 : 0;
                  return (
                    <div key={c.channel} className="flex items-center justify-between text-[12px]">
                      <span className="font-medium text-[var(--text-secondary)]">{c.channel}</span>
                      <span className="flex items-center gap-2">
                        <span className="text-[var(--text-muted)]">{c.orders} sip.</span>
                        <span className="font-mono font-semibold text-[var(--text-primary)]">
                          {new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(c.revenueTry)}
                        </span>
                        <span className="text-[10px] text-[var(--text-muted)] w-9 text-right">%{pct.toFixed(0)}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>
          )}
        </div>
        )}

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
                  <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Müşteri bilgileri</h2>
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
                    <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Kayıt metrikleri</h2>
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
                      <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">İlgi alanları</h2>
                      <p className="mt-2 text-[13px] leading-6 text-[var(--text-secondary)]">
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
                      <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Ürün ilgileri</h2>
                      <p className="mt-2 text-[13px] leading-6 text-[var(--text-secondary)]">
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
                      <p className="text-[13px] text-[var(--text-muted)]">Henüz ürün ilgisi eklenmedi.</p>
                    ) : (
                      customer.interests.map((interest) => (
                        <div
                          key={interest.id}
                          className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-3)] p-4"
                        >
                          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                            <div>
                              <p className="font-semibold text-[var(--text-primary)] text-[13px]">
                                {interest.product.name} ({interest.product.sku})
                              </p>
                              <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
                                Miktar: {interest.quantity}
                                {interest.quotedPrice
                                  ? ` | Teklif: ${interest.quotedPrice.toString()} ${interest.currency}`
                                  : ""}
                              </p>
                              {interest.interestNotes ? (
                                <p className="mt-3 text-[13px] leading-6 text-[var(--text-secondary)]">
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
                          <p className="mt-4 text-[11px] uppercase tracking-widest text-[var(--text-muted)]">
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
                      <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Kategori ilgileri</h2>
                      <p className="mt-2 text-[13px] leading-6 text-[var(--text-secondary)]">
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
                      <p className="text-[13px] text-[var(--text-muted)]">Henüz kategori ilgisi eklenmedi.</p>
                    ) : (
                      customer.categoryInterests.map((ci) => (
                        <div
                          key={ci.id}
                          className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-3)] p-4"
                        >
                          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                            <div>
                              <Link
                                href={`/categories/${ci.category.id}`}
                                className="font-semibold text-[var(--text-primary)] text-[13px] hover:text-[var(--accent)] transition-colors"
                              >
                                {ci.category.name}
                              </Link>
                              {ci.notes ? (
                                <p className="mt-2 text-[13px] leading-6 text-[var(--text-secondary)]">{ci.notes}</p>
                              ) : null}
                              <p className="mt-3 text-[11px] uppercase tracking-widest text-[var(--text-muted)]">
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
                      <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
                        Teklif stüdyosu
                      </p>
                      <h2 className="mt-2 text-[18px] font-semibold tracking-tight text-[var(--text-primary)]">
                        Bu müşteri için profesyonel teklif hazırla
                      </h2>
                      <p className="mt-2 max-w-3xl text-[13px] leading-6 text-[var(--text-secondary)]">
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
                        brand: p.brand ?? null,
                        stockQuantity: p.stockQuantity ?? null,
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
                  <div className="border-b border-[var(--border-subtle)] px-6 py-5">
                    <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">Teklif geçmişi</h3>
                    <p className="mt-2 text-[13px] leading-6 text-[var(--text-secondary)]">
                      Önceki teklifleri açın, PDF olarak inceleyin veya WhatsApp ile tekrar paylaşın.
                    </p>
                  </div>

                  {customer.quotes.length === 0 ? (
                    <div className="px-6 py-8 text-[13px] text-[var(--text-muted)]">
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
                            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-3)] p-5"
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
                                    <Button variant="secondary" size="sm">Aç</Button>
                                  </Link>
                                  <a href={`/quotes/${quote.id}/pdf`} target="_blank" rel="noreferrer">
                                    <Button variant="ghost" size="sm">PDF</Button>
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
                  <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Yeni not ekle</h2>
                  <p className="mt-2 text-[13px] leading-6 text-[var(--text-secondary)]">
                    Birleşik zaman çizelgesi (tüm notlar + görevler + teklifler + siparişler) sayfanın altında.
                  </p>

                  <div className="mt-6">
                    <CustomerNoteForm customerId={customer.id} />
                  </div>

                  <div className="mt-4 flex items-start gap-2 rounded-md bg-[var(--info-dim)] border border-[var(--info-border)] p-3 text-[12px] text-[var(--info)]">
                    <Lightbulb size={14} strokeWidth={1.5} className="mt-0.5 flex-shrink-0" />
                    <span>Eklediğin not + diğer tüm olaylar (görevler, teklifler, siparişler) sayfanın altındaki <strong>Zaman Çizelgesi</strong> bölümünde görünür.</span>
                  </div>
                </Card>

                <Card className="p-6">
                  <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Takip görevleri</h2>
                  <p className="mt-2 text-[13px] leading-6 text-[var(--text-secondary)]">
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
                      <p className="text-[13px] text-[var(--text-muted)]">Açık takip görevi bulunmuyor.</p>
                    ) : (
                      customer.tasks.map((task) => {
                        const isOverdue =
                          task.status === "OPEN" &&
                          !!task.dueDate &&
                          task.dueDate.getTime() < now;

                        return (
                          <div
                            key={task.id}
                            className={`rounded-lg border p-4 ${
                              isOverdue
                                ? "border-[var(--danger-border)] bg-[var(--danger-dim)]"
                                : "border-[var(--border-subtle)] bg-[var(--surface-3)]"
                            }`}
                          >
                            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                              <div>
                                <p className="font-semibold text-[var(--text-primary)] text-[13px]">{task.title}</p>
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
                                  <p className="mt-3 text-[13px] leading-6 text-[var(--text-secondary)]">
                                    {task.description}
                                  </p>
                                ) : null}
                                <p className="mt-3 text-[11px] uppercase tracking-widest text-[var(--text-muted)]">
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
          <ActivityIcon size={14} strokeWidth={1.5} className="text-[var(--text-secondary)]" />
          <h2 className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Zaman Çizelgesi</h2>
          <Badge variant="neutral">{timelineEvents.length} olay</Badge>
        </div>
        <p className="mb-3 text-[12px] text-[var(--text-muted)]">
          Notlar + görevler + teklifler + pazaryeri siparişleri + ilgi alanları — hepsi tek akışta, en yenisi üstte.
        </p>
        <CustomerTimeline events={timelineEvents} />
      </section>
      </div>

      {/* ── Sticky right rail (desktop only) ───────────────────── */}
      <aside className="hidden xl:block">
        <div className="sticky top-6 space-y-4">
          {/* P0: "İletişim" kartı kaldırıldı — telefon/whatsapp/email zaten hero başlığında var.
              Sadece "Son iletişim" tarihi göster (kritik takip bilgisi). */}
          {customer.lastContactedAt && (
            <Card className="p-5">
              <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
                Son iletişim
              </p>
              <p className="mt-2 text-[13px] font-semibold text-[var(--text-primary)]">
                {formatDateTime(customer.lastContactedAt)}
              </p>
            </Card>
          )}

          {/* Pazaryeri satış geçmişi (yeni — MarketplaceSalesRecord) */}
          {marketplaceStats && (
            <Card className="overflow-hidden p-0 border-[var(--ok-border)] bg-[var(--ok-dim)]">
              <div className="border-b border-[var(--ok-border)] bg-[var(--surface-2)] px-5 py-3.5">
                <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--ok)]">
                  Pazaryeri Satış Geçmişi
                </p>
                <p className="mt-2 text-[22px] font-semibold tracking-tight tabular-nums text-[var(--ok)]">
                  {fmtTry(marketplaceStats.totalRevenueTry)}
                </p>
                <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">
                  {marketplaceStats.totalOrders} sipariş · {marketplaceStats.uniqueProducts} farklı ürün
                </p>
                {marketplaceStats.lastOrderDate && (
                  <p className="mt-1 text-[10px] text-[var(--text-muted)]">
                    Son sipariş: {formatDateTime(marketplaceStats.lastOrderDate)}
                  </p>
                )}
              </div>
              {marketplaceStats.channels.length > 0 && (
                <div className="divide-y divide-[var(--border-subtle)]">
                  {marketplaceStats.channels.slice(0, 5).map((c) => (
                    <div
                      key={c.channel}
                      className="flex items-center justify-between px-5 py-2 text-[12px]"
                    >
                      <span className="font-medium text-[var(--text-secondary)]">
                        {CHANNEL_DISPLAY[c.channel] ?? c.channel}
                      </span>
                      <span className="font-mono text-[var(--text-secondary)]">
                        {c.orders} · {fmtTry(c.revenueTry)}
                      </span>
                    </div>
                  ))}
                  {marketplaceStats.channels.length > 5 && (
                    <p className="px-5 py-2 text-center text-[10px] text-[var(--text-muted)]">
                      + {marketplaceStats.channels.length - 5} kanal daha
                    </p>
                  )}
                </div>
              )}
            </Card>
          )}

          {/* P2: Sektör & Teknoloji sol bloka taşındı (hero altına). Sağ panelde tekrar gösterme. */}

          {/* Phase 96c — Ürün önerileri (kategori geçmişine göre) */}
          {productSuggestions.length > 0 && (
            <CustomerProductSuggestionsWidget
              customerId={customer.id}
              products={productSuggestions}
            />
          )}

          {/* Recent quotes */}
          <Card className="overflow-hidden">
            <div className="border-b border-[var(--border-subtle)] px-5 py-4">
              <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
                Son teklifler
              </p>
              <p className="mt-1 text-[15px] font-semibold text-[var(--text-primary)]">
                {customer.quotes.length} teklif
              </p>
            </div>
            {recentQuotes.length === 0 ? (
              <p className="px-5 py-4 text-[13px] text-[var(--text-muted)]">Henüz teklif yok.</p>
            ) : (
              <div className="divide-y divide-[var(--border-subtle)]">
                {recentQuotes.map((quote) => (
                  <Link
                    key={quote.id}
                    href={`/quotes/${quote.id}`}
                    className="block px-5 py-3 transition-colors hover:bg-[var(--surface-3)]"
                  >
                    <p className="text-[13px] font-semibold text-[var(--text-primary)]">{quote.quoteNumber}</p>
                    <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
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
      <dt className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">{label}</dt>
      <dd className="mt-2 text-[13px] font-medium text-[var(--text-primary)]">{value || "-"}</dd>
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
      <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">{label}</p>
      <div className="mt-2 rounded-lg bg-[var(--surface-3)] border border-[var(--border-subtle)] p-4 text-[13px] leading-6 text-[var(--text-secondary)]">
        {value || "-"}
      </div>
    </div>
  );
}

function HistoryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">{label}</p>
      <p className="mt-2 text-[13px] font-medium text-[var(--text-primary)]">{value}</p>
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
