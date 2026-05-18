import Link from "next/link";
import { notFound } from "next/navigation";

import { CustomerWorkspaceTabs } from "@/components/customers/customer-workspace-tabs";
import { CustomerAttributeSection } from "@/components/customers/customer-attribute-section";
import { CategoryInterestDeleteButton } from "@/components/categories/category-interest-delete-button";
import { CategoryInterestForm } from "@/components/categories/category-interest-form";
import { CustomerDeleteButton } from "@/components/customers/customer-delete-button";
import { CustomerWhatsAppButton } from "@/components/customers/customer-whatsapp-button";
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
  const [{ databaseAvailable, customer }, productOptionsResult, categoryOptionsResult, allAttributes, quoteTemplates, taskUsers] =
    await Promise.all([
      getCustomerById(id),
      listCustomerInterestProducts(),
      listCategoriesForSelect(),
      listAttributes(),
      listQuoteTemplates(),
      canAssign ? listUsersWithTasks() : Promise.resolve([]),
    ]);

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

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
      {/* ── Main workspace ─────────────────────────────────────── */}
      <div className="min-w-0 space-y-6">
        <Card className="p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <Badge tone={getCustomerStatusTone(customer.status)}>
                {formatCustomerStatus(customer.status)}
              </Badge>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">
                {customer.name}
              </h1>
              <p className="mt-2 text-sm text-slate-500">
                {customer.company ?? "Firma belirtilmedi"}
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <CustomerWhatsAppButton
                customerId={customer.id}
                phone={customer.whatsapp ?? customer.phone}
                customerName={customer.name}
              />
              <Link href={`/customers/${customer.id}/edit`}>
                <Button>Düzenle</Button>
              </Link>
              <CustomerDeleteButton customerId={customer.id} />
            </div>
          </div>
        </Card>

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
            label: "Notlar ve Takipler",
            hint: "Zaman çizelgesi ve görevler",
            content: (
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <Card className="p-6">
                  <h2 className="text-lg font-semibold text-slate-950">Not zaman çizelgesi</h2>
                  <p className="mt-2 text-sm leading-7 text-slate-600">
                    Arama, e-posta, toplantı ve teklif notlarını kronolojik olarak kaydedin.
                  </p>

                  <div className="mt-6">
                    <CustomerNoteForm customerId={customer.id} />
                  </div>

                  <div className="mt-8 space-y-4">
                    {customer.timelineEntries.length === 0 ? (
                      <p className="text-sm text-slate-500">
                        Zaman çizelgesi için not bulunmuyor.
                      </p>
                    ) : (
                      customer.timelineEntries.map((entry) => (
                        <div
                          key={entry.id}
                          className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge>{formatNoteType(entry.type)}</Badge>
                            <span className="text-xs uppercase tracking-[0.25em] text-slate-400">
                              {formatDateTime(entry.createdAt)}
                            </span>
                          </div>
                          <p className="mt-3 text-sm leading-7 text-slate-700">{entry.content}</p>
                          <p className="mt-3 text-xs uppercase tracking-[0.25em] text-slate-400">
                            {entry.createdBy?.name ?? "Sistem"}
                          </p>
                        </div>
                      ))
                    )}
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
              />
              <Link href={`/customers/${customer.id}/edit`} className="w-full">
                <Button variant="secondary" className="w-full">
                  Müşteriyi düzenle
                </Button>
              </Link>
            </div>
          </Card>

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
