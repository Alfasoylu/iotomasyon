"use client";

import { startTransition, useState } from "react";

import { Button } from "@/components/ui/button";
import { markQuoteSentAction } from "@/lib/actions/quote-actions";
import { COMPANY_SETTINGS } from "@/lib/company-settings";
import { formatDateTime } from "@/lib/utils";

export function QuoteWhatsAppButton({
  quoteId,
  phone,
  customerName,
  quoteNumber,
  totalDisplay,
  validityDate,
}: {
  quoteId: string;
  phone?: string | null;
  customerName: string;
  quoteNumber: string;
  totalDisplay: string;
  validityDate?: Date | null;
}) {
  const [pending, setPending] = useState(false);

  return (
    <Button
      variant="secondary"
      disabled={pending || !phone}
      onClick={() => {
        if (!phone) {
          return;
        }

        setPending(true);

        startTransition(async () => {
          await markQuoteSentAction(quoteId);

          const baseUrl = window.location.origin;
          const quoteUrl = `${baseUrl}/quotes/${quoteId}`;
          const text = [
            `Merhaba ${customerName},`,
            "",
            `${quoteNumber} numaralı fiyat teklifimizi bilgilerinize sunarız.`,
            "",
            `Toplam: ${totalDisplay}`,
            `Geçerlilik: ${validityDate ? formatDateTime(validityDate) : "Belirtilmedi"}`,
            `PDF: ${quoteUrl}/pdf`,
            "",
            "Sorularınız için bize ulaşabilirsiniz.",
            "",
            COMPANY_SETTINGS.companyName,
            COMPANY_SETTINGS.website,
          ].join("\n");
          const sanitizedPhone = phone.replace(/[^\d]/g, "");
          window.open(
            `https://wa.me/${sanitizedPhone}?text=${encodeURIComponent(text)}`,
            "_blank",
            "noopener,noreferrer",
          );
          setPending(false);
        });
      }}
    >
      {pending ? "Mesaj hazırlanıyor..." : "WhatsApp ile gönder"}
    </Button>
  );
}
