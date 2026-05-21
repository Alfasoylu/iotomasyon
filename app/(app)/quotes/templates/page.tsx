import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { listQuoteTemplates } from "@/services/quote-template-service";
import { listProducts } from "@/services/product-service";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { QuoteTemplateForm, DeleteTemplateButton } from "@/components/quotes/quote-template-form";
import { COMPANY_SETTINGS } from "@/lib/company-settings";

export const dynamic = "force-dynamic";

const CURRENCY_LABELS: Record<string, string> = {
  TRY: "Sadece TL",
  USD: "Sadece USD",
  BOTH: "USD + TL",
};

export default async function QuoteTemplatesPage() {
  await requirePermission(PERMISSIONS.QUOTE_TEMPLATES_READ);
  const [templates, productsResult] = await Promise.all([
    listQuoteTemplates(),
    listProducts({}),
  ]);

  const products = productsResult.products.map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku ?? "",
    sellingPriceTry: p.sellingPriceTry ? Number(p.sellingPriceTry) : null,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-1)]">
        <div className="h-1 bg-[var(--accent)]" />
        <div className="px-6 py-8 xl:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
                Teklifler
              </p>
              <h1 className="mt-3 text-[22px] font-semibold tracking-tight text-[var(--text-primary)]">
                Teklif Şablonları
              </h1>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                Hazır şablonlarla teklif oluşturma sürenizi kısaltın.
              </p>
            </div>
            <Link
              href="/quotes"
              className="text-sm font-medium text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
            >
              ← Tekliflere Dön
            </Link>
          </div>
        </div>
      </div>

      {/* Create form */}
      <Card className="overflow-hidden">
        <div className="border-b border-[var(--border-subtle)] px-6 py-5">
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Yeni Şablon</p>
          <h2 className="mt-2 text-lg font-semibold text-[var(--text-primary)]">Şablon Oluştur</h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Teklife dönüştürmek için kalemler, koşullar ve para birimi ayarlayın.
          </p>
        </div>
        <div className="px-6 py-6">
          <QuoteTemplateForm
            products={products}
            defaultPaymentTerms={COMPANY_SETTINGS.paymentTerms}
            defaultDeliveryTerms={COMPANY_SETTINGS.deliveryTerms}
            defaultWarrantyTerms={COMPANY_SETTINGS.warrantyTerms}
          />
        </div>
      </Card>

      {/* Existing templates */}
      <Card className="overflow-hidden">
        <div className="border-b border-[var(--border-subtle)] px-6 py-5">
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
            Mevcut Şablonlar ({templates.length})
          </p>
          <h2 className="mt-2 text-lg font-semibold text-[var(--text-primary)]">Kayıtlı Şablonlar</h2>
        </div>

        {templates.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-[var(--text-muted)]">
            Henüz şablon oluşturulmadı.
          </div>
        ) : (
          <div className="divide-y divide-[var(--border-subtle)]">
            {templates.map((template) => (
              <div key={template.id} className="px-6 py-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-[var(--text-primary)]">{template.name}</h3>
                      <Badge variant="neutral">{CURRENCY_LABELS[template.currencyMode] ?? template.currencyMode}</Badge>
                      <Badge variant="neutral">{template.items.length} kalem</Badge>
                    </div>
                    {template.description ? (
                      <p className="mt-1 text-sm text-[var(--text-secondary)]">{template.description}</p>
                    ) : null}
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                      Oluşturan: {template.createdBy?.name ?? "—"} · {new Date(template.createdAt).toLocaleDateString("tr-TR")}
                    </p>

                    {template.items.length > 0 ? (
                      <div className="mt-3 space-y-1">
                        {template.items.map((item) => (
                          <div key={item.id} className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                            <span className="text-[var(--text-muted)]">·</span>
                            <span className="tabular-nums font-mono">{item.quantity}×</span>
                            <span className="font-medium">{item.description}</span>
                            <span className="text-[var(--text-muted)] text-xs tabular-nums font-mono">
                              {Number(item.unitPrice).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} {item.currency}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <DeleteTemplateButton id={template.id} name={template.name} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
