"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildQueryString } from "@/lib/utils";
import { CUSTOMER_STATUS_OPTIONS } from "@/types/customers";

export function CustomerFilters({
  initialQuery,
  initialStatus,
}: {
  initialQuery: string;
  initialStatus: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(initialQuery);
  const [status, setStatus] = useState(initialStatus);

  return (
    <form
      className="grid gap-3 md:grid-cols-[minmax(0,2fr)_220px_auto]"
      onSubmit={(event) => {
        event.preventDefault();

        const nextQuery = buildQueryString(searchParams, {
          q: query || undefined,
          status,
        });

        router.push(`/customers${nextQuery}`);
      }}
    >
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Musteri, firma, telefon, WhatsApp veya e-posta ara"
      />

      <select
        value={status}
        onChange={(event) => setStatus(event.target.value)}
        className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900"
      >
        <option value="all">Tum durumlar</option>
        {CUSTOMER_STATUS_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>

      <Button type="submit">Filtrele</Button>
    </form>
  );
}
