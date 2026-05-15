"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildQueryString } from "@/lib/utils";

export function ProductFilters({
  initialQuery,
  initialStatus,
  initialStock,
}: {
  initialQuery: string;
  initialStatus: string;
  initialStock: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(initialQuery);
  const [status, setStatus] = useState(initialStatus);
  const [stock, setStock] = useState(initialStock);

  return (
    <form
      className="grid gap-3 md:grid-cols-[minmax(0,2fr)_180px_180px_auto]"
      onSubmit={(event) => {
        event.preventDefault();

        const nextQuery = buildQueryString(searchParams, {
          q: query || undefined,
          status,
          stock,
        });

        router.push(`/products${nextQuery}`);
      }}
    >
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="SKU, ürün adı, marka veya lokasyon ara"
      />

      <select
        value={status}
        onChange={(event) => setStatus(event.target.value)}
        className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900"
      >
        <option value="all">Tum durumlar</option>
        <option value="active">Sadece aktif</option>
        <option value="inactive">Sadece pasif</option>
      </select>

      <select
        value={stock}
        onChange={(event) => setStock(event.target.value)}
        className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900"
      >
        <option value="all">Tum stoklar</option>
        <option value="low">Dusuk stok</option>
      </select>

      <Button type="submit">Filtrele</Button>
    </form>
  );
}
