"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildQueryString } from "@/lib/utils";
import {
  CUSTOMER_STATUS_OPTIONS,
  CUSTOMER_SOURCE_OPTIONS,
  CUSTOMER_TYPE_OPTIONS,
  CUSTOMER_TYPE_LABELS,
} from "@/types/customers";
import { formatCustomerStatus } from "@/lib/customer-utils";
import type { AttributeOption } from "@/services/attribute-service";
import type { UserOption } from "@/services/customer-service";

export function CustomerFilters({
  initialQuery,
  initialStatus,
  initialSource,
  initialOwnedById,
  initialAttributeId,
  initialCustomerType,
  users,
  attributes = [],
}: {
  initialQuery: string;
  initialStatus: string;
  initialSource: string;
  initialOwnedById: string;
  initialAttributeId: string;
  initialCustomerType: string;
  users: UserOption[];
  attributes?: AttributeOption[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query,        setQuery]        = useState(initialQuery);
  const [status,       setStatus]       = useState(initialStatus);
  const [source,       setSource]       = useState(initialSource);
  const [ownedById,    setOwnedById]    = useState(initialOwnedById);
  const [attributeId,  setAttributeId]  = useState(initialAttributeId);
  const [customerType, setCustomerType] = useState(initialCustomerType);

  return (
    <form
      className="grid gap-3 md:grid-cols-[minmax(0,2fr)_160px_160px_160px_160px_160px_auto]"
      onSubmit={(event) => {
        event.preventDefault();

        const nextQuery = buildQueryString(searchParams, {
          q:            query        || undefined,
          status:       status       !== "all" ? status       : undefined,
          source:       source       !== "all" ? source       : undefined,
          ownedById:    ownedById    !== "all" ? ownedById    : undefined,
          attributeId:  attributeId  !== "all" ? attributeId  : undefined,
          customerType: customerType !== "all" ? customerType : undefined,
        });

        router.push(`/customers${nextQuery}`);
      }}
    >
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Müşteri, firma, telefon, WhatsApp veya e-posta ara"
      />

      <select
        value={status}
        onChange={(event) => setStatus(event.target.value)}
        className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900"
      >
        <option value="all">Tüm durumlar</option>
        {CUSTOMER_STATUS_OPTIONS.map((option) => (
          <option key={option} value={option}>{formatCustomerStatus(option)}</option>
        ))}
      </select>

      <select
        value={source}
        onChange={(event) => setSource(event.target.value)}
        className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900"
      >
        <option value="all">Tüm kaynaklar</option>
        {CUSTOMER_SOURCE_OPTIONS.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>

      {users.length > 0 && (
        <select
          value={ownedById}
          onChange={(event) => setOwnedById(event.target.value)}
          className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900"
        >
          <option value="all">Tüm sahipler</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
      )}

      {attributes.length > 0 && (
        <select
          value={attributeId}
          onChange={(event) => setAttributeId(event.target.value)}
          className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900"
        >
          <option value="all">Tüm özellikler</option>
          {attributes.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      )}

      <select
        value={customerType}
        onChange={(event) => setCustomerType(event.target.value)}
        className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900"
      >
        <option value="all">Tüm tipler</option>
        {CUSTOMER_TYPE_OPTIONS.map((t) => (
          <option key={t} value={t}>{CUSTOMER_TYPE_LABELS[t]}</option>
        ))}
      </select>

      <Button type="submit">Filtrele</Button>
    </form>
  );
}
