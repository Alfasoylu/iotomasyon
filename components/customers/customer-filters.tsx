"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

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

interface IndustryGroupOption {
  id: string;
  name: string;
  slug: string;
  children: Array<{ id: string; name: string; slug: string }>;
}

interface CityOption {
  city: string;
  count: number;
}
interface DistrictOption {
  district: string;
  count: number;
}

export function CustomerFilters({
  initialQuery,
  initialStatus,
  initialSource,
  initialOwnedById,
  initialAttributeId,
  initialCustomerType,
  initialSegment = "all",
  initialCity = "all",
  initialDistrict = "all",
  initialIndustryGroupId = "all",
  initialIndustryId = "all",
  initialCategoryId = "all",
  users,
  attributes = [],
  cities = [],
  districtsByCity = {},
  industryGroups = [],
  categories = [],
}: {
  initialQuery: string;
  initialStatus: string;
  initialSource: string;
  initialOwnedById: string;
  initialAttributeId: string;
  initialCustomerType: string;
  initialSegment?: string;
  initialCity?: string;
  initialDistrict?: string;
  initialIndustryGroupId?: string;
  initialIndustryId?: string;
  initialCategoryId?: string;
  users: UserOption[];
  attributes?: AttributeOption[];
  cities?: CityOption[];
  districtsByCity?: Record<string, DistrictOption[]>;
  industryGroups?: IndustryGroupOption[];
  categories?: Array<{ id: string; name: string; slug: string }>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query,        setQuery]        = useState(initialQuery);
  const [status,       setStatus]       = useState(initialStatus);
  const [source,       setSource]       = useState(initialSource);
  const [ownedById,    setOwnedById]    = useState(initialOwnedById);
  const [attributeId,  setAttributeId]  = useState(initialAttributeId);
  const [customerType, setCustomerType] = useState(initialCustomerType);
  const [segment,      setSegment]      = useState(initialSegment);
  const [city,            setCity]            = useState(initialCity);
  const [district,        setDistrict]        = useState(initialDistrict);
  const [industryGroupId, setIndustryGroupId] = useState(initialIndustryGroupId);
  const [industryId,      setIndustryId]      = useState(initialIndustryId);
  const [categoryId,      setCategoryId]      = useState(initialCategoryId);

  // Cascading: city seçilince ilçe listesi değişir
  const availableDistricts = useMemo(() => {
    if (city === "all") return [];
    return districtsByCity[city] ?? [];
  }, [city, districtsByCity]);

  // Cascading: group seçilince alt sektörler değişir
  const availableSubIndustries = useMemo(() => {
    if (industryGroupId === "all") return [];
    return industryGroups.find((g) => g.id === industryGroupId)?.children ?? [];
  }, [industryGroupId, industryGroups]);

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        const nextQuery = buildQueryString(searchParams, {
          q:               query        || undefined,
          status:          status          !== "all" ? status        : undefined,
          source:          source          !== "all" ? source        : undefined,
          ownedById:       ownedById       !== "all" ? ownedById     : undefined,
          attributeId:     attributeId     !== "all" ? attributeId   : undefined,
          customerType:    customerType    !== "all" ? customerType  : undefined,
          segment:         segment         !== "all" ? segment       : undefined,
          city:            city            !== "all" ? city          : undefined,
          district:        district        !== "all" ? district      : undefined,
          industryGroupId: industryGroupId !== "all" ? industryGroupId : undefined,
          industryId:      industryId      !== "all" ? industryId    : undefined,
          categoryId:      categoryId      !== "all" ? categoryId    : undefined,
        });
        router.push(`/customers${nextQuery}`);
      }}
    >
      {/* Satır 1: Arama + temel filtreler */}
      <div className="grid gap-2 md:grid-cols-[minmax(0,2fr)_140px_140px_140px_auto]">
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
          value={segment}
          onChange={(event) => setSegment(event.target.value)}
          className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900"
          title="Çatı: B2B Bayi / Montaj Fırsatı / Pazaryeri"
        >
          <option value="all">Tüm çatılar</option>
          <option value="B2B_RESELLER">B2B Bayilerim</option>
          <option value="INSTALLATION">Montaj Fırsatları</option>
          <option value="MARKETPLACE">Pazaryeri</option>
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
        <Button type="submit">Filtrele</Button>
      </div>

      {/* Satır 2: Konum + sektör + kategori */}
      <div className="grid gap-2 md:grid-cols-5">
        <select
          value={city}
          onChange={(event) => { setCity(event.target.value); setDistrict("all"); }}
          className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900"
        >
          <option value="all">Tüm şehirler</option>
          {cities.map((c) => (
            <option key={c.city} value={c.city}>
              {c.city} ({c.count})
            </option>
          ))}
        </select>
        <select
          value={district}
          onChange={(event) => setDistrict(event.target.value)}
          disabled={city === "all"}
          className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 disabled:opacity-50"
        >
          <option value="all">{city === "all" ? "Önce şehir seç" : "Tüm ilçeler"}</option>
          {availableDistricts.map((d) => (
            <option key={d.district} value={d.district}>
              {d.district} ({d.count})
            </option>
          ))}
        </select>
        <select
          value={industryGroupId}
          onChange={(event) => { setIndustryGroupId(event.target.value); setIndustryId("all"); }}
          className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900"
        >
          <option value="all">Tüm sektör grupları</option>
          {industryGroups.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
        <select
          value={industryId}
          onChange={(event) => setIndustryId(event.target.value)}
          disabled={industryGroupId === "all"}
          className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 disabled:opacity-50"
        >
          <option value="all">{industryGroupId === "all" ? "Önce grup seç" : "Alt sektör (tümü)"}</option>
          {availableSubIndustries.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
          className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900"
          title="Müşterinin ilgilendiği ürün kategorisi"
        >
          <option value="all">Tüm ürün kategorileri</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* Satır 3: Source + customerType + attribute (eski filtreler, daha gizli) */}
      <details className="text-sm">
        <summary className="cursor-pointer text-slate-500 hover:text-slate-700">
          Diğer filtreler (kaynak / müşteri tipi / özellik)
        </summary>
        <div className="mt-2 grid gap-2 md:grid-cols-3">
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
        </div>
      </details>
    </form>
  );
}
