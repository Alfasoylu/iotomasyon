"use client";

import { startTransition, useState } from "react";

import { markQuoteSentAction } from "@/lib/actions/quote-actions";
import { Button } from "@/components/ui/button";

export function QuoteWhatsAppButton({
  quoteId,
  phone,
  customerName,
}: {
  quoteId: string;
  phone?: string | null;
  customerName: string;
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
          const text = `Merhaba ${customerName}, teklifinizi buradan inceleyebilirsiniz: ${quoteUrl}`;
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
      {pending ? "Hazirlaniyor..." : "WhatsApp ile gonder"}
    </Button>
  );
}
