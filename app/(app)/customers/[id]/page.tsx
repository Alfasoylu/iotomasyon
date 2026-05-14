import Link from "next/link";
import { notFound } from "next/navigation";

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
import { formatDateTime } from "@/lib/utils";
import {
  getCustomerById,
  listCustomerInterestProducts,
} from "@/services/customer-service";
import { listCategoriesForSelect } from "@/services/category-service";
import { listAttributes } from "@/services/attribute-service";
import { formatCurrencyAmount, formatQuoteStatus, getQuoteStatusTone } from "@/lib/quote-utils";

export const dynamic = "force-dynamic";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [{ databaseAvailable, customer }, productOptionsResult, categoryOptionsResult, allAttributes] = await Promise.all([
    getCustomerById(id),
    listCustomerInterestProducts(),
    listCategoriesForSelect(),
    listAttributes(),
  ]);

  if (!databaseAvailable) {
    return (
      <div className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
            Customers
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
            Musteri detayi gecici olarak kullanilamiyor
          </h1>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            Veritabani baglantisi su anda kullanilamiyor. Baglanti geri geldiginde
            musteri detaylari tekrar yuklenecek.
          </p>
        </div>

        <Card className="border-amber-200 bg-amber-50 p-6 text-sm leading-7 text-amber-900">
          Canli musteri verisi alinamadigi icin detay ekrani gosterilemiyor.
        </Card>
      </div>
    );
  }

  if (!customer) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <Badge tone={getCustomerStatusTone(customer.status)}>
            {formatCustomerStatus(customer.status)}
          </Badge>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">
            {customer.name}
          </h1>
          <p className="mt-2 text-sm text-slate-500">{customer.company ?? "Firma belirtilmedi"}</p>
        </div>

        <div className="flex flex-wrap gap-3">
          <CustomerWhatsAppButton
            customerId={customer.id}
            phone={customer.whatsapp ?? customer.phone}
            customerName={customer.name}
          />
          <Link href={`/customers/${customer.id}/edit`}>
            <Button>Duzenle</Button>
          </Link>
          <CustomerDeleteButton customerId={customer.id} />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-slate-950">Musteri bilgileri</h2>
          <dl className="mt-5 grid gap-4 sm:grid-cols-2">
            <Info label="Telefon" value={customer.phone} />
            <Info label="WhatsApp" value={customer.whatsapp} />
            <Info label="E-posta" value={customer.email} />
            <Info label="Vergi no" value={customer.taxNumber} />
            <Info label="Sehir" value={customer.city} />
            <Info label="Ulke" value={customer.country} />
            <Info label="Müşteri kaynağı" value={customer.source} />
            <Info label="Müşteri sahibi" value={customer.owner?.name} />
          </dl>
          <div className="mt-6 grid gap-4">
            <InfoBlock label="Adres" value={customer.address} />
            <InfoBlock label="CRM notu" value={customer.customerNotes} />
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-lg font-semibold text-slate-950">Kayit metrikleri</h2>
          <dl className="mt-5 space-y-4">
            <Info label="Olusturulma" value={formatDateTime(customer.createdAt)} />
            <Info label="Guncellenme" value={formatDateTime(customer.updatedAt)} />
            {customer.lastContactedAt ? (
              <Info label="Son iletisim" value={formatDateTime(customer.lastContactedAt)} />
            ) : null}
          </dl>
        </Card>
      </div>

      {allAttributes.length > 0 && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-slate-950">İlgi alanları</h2>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            Müşterinin ilgilendiği ürün özellikleri. Kampanya eşleşmesinde kullanılır.
          </p>
          <div className="mt-5">
            <CustomerAttributeSection
              customerId={customer.id}
              allAttributes={allAttributes}
              initialAttributeIds={customer.attributeInterests.map((ai) => ai.attributeId)}
            />
          </div>
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Urun ilgileri</h2>
              <p className="mt-2 text-sm leading-7 text-slate-600">
                Musterinin ilgilendigi urunleri ve teklif surecini takip edin.
              </p>
            </div>
            <Badge>{customer.interests.length} kayit</Badge>
          </div>

          <div className="mt-6">
            <CustomerInterestForm
              customerId={customer.id}
              products={productOptionsResult.products}
            />
          </div>

          <div className="mt-8 space-y-4">
            {customer.interests.length === 0 ? (
              <p className="text-sm text-slate-500">Henuz urun ilgisi eklenmedi.</p>
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

        <div className="space-y-4">
          <Card className="p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">Kategori ilgileri</h2>
                <p className="mt-2 text-sm leading-7 text-slate-600">
                  Müşterinin ilgilendiği ürün kategorilerini takip edin.
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

          <Card className="p-6">
            <h2 className="text-lg font-semibold text-slate-950">Teklifler</h2>
            <p className="mt-2 text-sm leading-7 text-slate-600">
              Musteri icin teklif olusturun, PDF olarak disa aktarın ve WhatsApp ile gonderin.
            </p>

            <div className="mt-6">
              <QuoteForm customerId={customer.id} products={productOptionsResult.products} />
            </div>

            <div className="mt-8 space-y-4">
              {customer.quotes.length === 0 ? (
                <p className="text-sm text-slate-500">Henuz teklif olusturulmadi.</p>
              ) : (
                customer.quotes.map((quote) => (
                  <div
                    key={quote.id}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="font-semibold text-slate-900">{quote.quoteNumber}</p>
                        <p className="mt-1 text-sm text-slate-600">
                          {formatCurrencyAmount(quote.total.toString(), quote.items[0]?.currency ?? "TRY")}
                        </p>
                        <p className="mt-3 text-xs uppercase tracking-[0.25em] text-slate-400">
                          {formatDateTime(quote.createdAt)}
                        </p>
                      </div>

                      <div className="flex flex-col items-start gap-3 md:items-end">
                        <Badge tone={getQuoteStatusTone(quote.status)}>
                          {formatQuoteStatus(quote.status)}
                        </Badge>
                        <Link
                          href={`/quotes/${quote.id}`}
                          className="text-sm font-semibold text-slate-900 hover:text-[color:var(--accent)]"
                        >
                          Teklifi ac
                        </Link>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="text-lg font-semibold text-slate-950">Not timeline</h2>
            <p className="mt-2 text-sm leading-7 text-slate-600">
              Arama, e-posta, toplanti ve teklif notlarini kronolojik olarak kaydedin.
            </p>

            <div className="mt-6">
              <CustomerNoteForm customerId={customer.id} />
            </div>

            <div className="mt-8 space-y-4">
              {customer.timelineEntries.length === 0 ? (
                <p className="text-sm text-slate-500">Timeline icin not bulunmuyor.</p>
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
                      {entry.createdBy?.name ?? "System"}
                    </p>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="text-lg font-semibold text-slate-950">Takip gorevleri</h2>
            <p className="mt-2 text-sm leading-7 text-slate-600">
              Acik follow-up kayitlarini planlayin ve tamamlandiginda kapatin.
            </p>

            <div className="mt-6">
              <CustomerTaskForm customerId={customer.id} />
            </div>

            <div className="mt-8 space-y-4">
              {customer.tasks.length === 0 ? (
                <p className="text-sm text-slate-500">Acik takip gorevi bulunmuyor.</p>
              ) : (
                customer.tasks.map((task) => {
                  const isOverdue =
                    task.status === "OPEN" &&
                    !!task.dueDate &&
                    task.dueDate.getTime() < Date.now();
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
                          {isOverdue ? <Badge tone="danger">Overdue</Badge> : null}
                        </div>
                        {task.description ? (
                          <p className="mt-3 text-sm leading-7 text-slate-600">
                            {task.description}
                          </p>
                        ) : null}
                        <p className="mt-3 text-xs uppercase tracking-[0.25em] text-slate-400">
                          {task.dueDate ? `Termin: ${formatDateTime(task.dueDate)}` : "Termin yok"}
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
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-[0.25em] text-slate-500">{label}</dt>
      <dd className="mt-2 text-sm font-medium text-slate-900">{value || "-"}</dd>
    </div>
  );
}

function InfoBlock({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.25em] text-slate-500">{label}</p>
      <div className="mt-2 rounded-2xl bg-slate-50 p-4 text-sm leading-7 text-slate-600">
        {value || "-"}
      </div>
    </div>
  );
}
