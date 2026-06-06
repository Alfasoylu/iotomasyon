"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  updateCompanySettingsAction,
  type CompanySettingsInput,
} from "@/lib/actions/company-settings-actions";

interface Props {
  initial: CompanySettingsInput;
}

const labelClass =
  "block text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]";
const helperClass = "mt-1 text-[11px] text-[var(--text-muted)]";

export function CompanySettingsForm({ initial }: Props) {
  const router = useRouter();
  const [values, setValues] = useState<CompanySettingsInput>(initial);
  const [pending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof CompanySettingsInput, string[]>>>({});

  function set<K extends keyof CompanySettingsInput>(key: K, value: CompanySettingsInput[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      const res = await updateCompanySettingsAction(values);
      if (res.ok) {
        setSavedAt(Date.now());
        router.refresh();
        setTimeout(() => setSavedAt(null), 3000);
      } else {
        setError(res.message ?? "Kaydedilemedi.");
        setFieldErrors((res.fieldErrors ?? {}) as Partial<Record<keyof CompanySettingsInput, string[]>>);
      }
    });
  }

  const justSaved = savedAt && Date.now() - savedAt < 3000;

  return (
    <form onSubmit={submit} className="space-y-8">
      <Section title="Marka & Kimlik">
        <Field label="Ticari Adı (Marka)" error={fieldErrors.companyName?.[0]}>
          <Input
            value={values.companyName}
            onChange={(e) => set("companyName", e.target.value)}
            disabled={pending}
          />
        </Field>
        <Field label="Resmi Ünvan (Legal Name)" error={fieldErrors.legalName?.[0]}>
          <Input
            value={values.legalName}
            onChange={(e) => set("legalName", e.target.value)}
            disabled={pending}
          />
        </Field>
        <Field label="Slogan / Tagline" error={fieldErrors.tagline?.[0]}>
          <Input
            value={values.tagline}
            onChange={(e) => set("tagline", e.target.value)}
            disabled={pending}
          />
        </Field>
        <Field label="Satış Departmanı / Kontak" error={fieldErrors.salesContact?.[0]}>
          <Input
            value={values.salesContact}
            onChange={(e) => set("salesContact", e.target.value)}
            disabled={pending}
          />
        </Field>
      </Section>

      <Section title="İletişim">
        <Grid2>
          <Field label="Telefon (Birincil)" error={fieldErrors.phone?.[0]}>
            <Input value={values.phone} onChange={(e) => set("phone", e.target.value)} disabled={pending} />
          </Field>
          <Field label="Telefon (İkincil) / WhatsApp" error={fieldErrors.phoneSecondary?.[0]}>
            <Input
              value={values.phoneSecondary}
              onChange={(e) => set("phoneSecondary", e.target.value)}
              disabled={pending}
            />
          </Field>
        </Grid2>
        <Grid2>
          <Field label="E-posta" error={fieldErrors.email?.[0]}>
            <Input
              type="email"
              value={values.email}
              onChange={(e) => set("email", e.target.value)}
              disabled={pending}
            />
          </Field>
          <Field label="Web Sitesi" error={fieldErrors.website?.[0]}>
            <Input
              value={values.website}
              onChange={(e) => set("website", e.target.value)}
              disabled={pending}
            />
          </Field>
        </Grid2>
      </Section>

      <Section title="Adresler">
        <Field label="Birincil Adres" error={fieldErrors.address?.[0]}>
          <Textarea
            value={values.address}
            onChange={(e) => set("address", e.target.value)}
            disabled={pending}
            rows={2}
          />
        </Field>
        <Field label="Perpa / İkincil Adres" error={fieldErrors.perpaAddress?.[0]}>
          <Textarea
            value={values.perpaAddress}
            onChange={(e) => set("perpaAddress", e.target.value)}
            disabled={pending}
            rows={2}
          />
        </Field>
        <Grid3>
          <Field label="İl" error={fieldErrors.city?.[0]}>
            <Input value={values.city} onChange={(e) => set("city", e.target.value)} disabled={pending} />
          </Field>
          <Field label="İlçe" error={fieldErrors.district?.[0]}>
            <Input value={values.district} onChange={(e) => set("district", e.target.value)} disabled={pending} />
          </Field>
          <Field label="Ülke" error={fieldErrors.country?.[0]}>
            <Input value={values.country} onChange={(e) => set("country", e.target.value)} disabled={pending} />
          </Field>
        </Grid3>
      </Section>

      <Section title="Vergi Bilgileri">
        <Grid2>
          <Field label="Vergi Dairesi" error={fieldErrors.taxOffice?.[0]}>
            <Input value={values.taxOffice} onChange={(e) => set("taxOffice", e.target.value)} disabled={pending} />
          </Field>
          <Field label="Vergi Numarası" error={fieldErrors.taxNumber?.[0]}>
            <Input value={values.taxNumber} onChange={(e) => set("taxNumber", e.target.value)} disabled={pending} />
          </Field>
        </Grid2>
      </Section>

      <Section title="Banka Bilgileri (PDF'lerde gösterilir)">
        <Grid2>
          <Field label="Banka Adı" error={fieldErrors.bankName?.[0]}>
            <Input value={values.bankName} onChange={(e) => set("bankName", e.target.value)} disabled={pending} />
          </Field>
          <Field label="Hesap Türü" error={fieldErrors.bankAccountType?.[0]}>
            <Input
              value={values.bankAccountType}
              onChange={(e) => set("bankAccountType", e.target.value)}
              disabled={pending}
            />
          </Field>
        </Grid2>
        <Field label="IBAN" error={fieldErrors.bankIban?.[0]}>
          <Input
            value={values.bankIban}
            onChange={(e) => set("bankIban", e.target.value)}
            disabled={pending}
            className="font-mono tabular-nums"
          />
        </Field>
        <Field label="Hesap Sahibi" error={fieldErrors.bankAccountHolder?.[0]}>
          <Input
            value={values.bankAccountHolder}
            onChange={(e) => set("bankAccountHolder", e.target.value)}
            disabled={pending}
          />
        </Field>
      </Section>

      <Section title="Ticari Koşullar (Default — PDF'lerde fallback olur)">
        <p className="text-[12px] text-[var(--text-secondary)]">
          Quote başına özel ödeme/teslimat/garanti koşulu girersen oradaki override geçer.
          Bunlar varsayılan değerlerdir.
        </p>
        <Field label="Ödeme Koşulları" error={fieldErrors.paymentTerms?.[0]}>
          <Textarea
            value={values.paymentTerms}
            onChange={(e) => set("paymentTerms", e.target.value)}
            disabled={pending}
            rows={3}
          />
        </Field>
        <Field label="Teslimat Koşulları" error={fieldErrors.deliveryTerms?.[0]}>
          <Textarea
            value={values.deliveryTerms}
            onChange={(e) => set("deliveryTerms", e.target.value)}
            disabled={pending}
            rows={3}
          />
        </Field>
        <Field label="Garanti Koşulları" error={fieldErrors.warrantyTerms?.[0]}>
          <Textarea
            value={values.warrantyTerms}
            onChange={(e) => set("warrantyTerms", e.target.value)}
            disabled={pending}
            rows={3}
          />
        </Field>
      </Section>

      <div className="flex items-center gap-3 border-t border-[var(--border-subtle)] pt-4">
        <Button type="submit" disabled={pending}>
          <Save size={14} strokeWidth={1.5} />
          {pending ? "Kaydediliyor…" : "Kaydet"}
        </Button>
        {justSaved && (
          <span className="inline-flex items-center gap-1.5 text-[13px] text-[var(--ok)]">
            <Check size={14} strokeWidth={1.5} /> Kaydedildi. PDF'ler bir sonraki üretimde yeni bilgilerle çıkar.
          </span>
        )}
        {error && <span className="text-[13px] text-[var(--danger)]">{error}</span>}
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h2 className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">{title}</h2>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Grid2({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2">{children}</div>;
}

function Grid3({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-3">{children}</div>;
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className={labelClass}>{label}</label>
      {children}
      {error && <p className={`${helperClass} text-[var(--danger)]`}>{error}</p>}
    </div>
  );
}
