"use client";

import { useState, useTransition } from "react";
import { saveSupplierAction, deleteSupplierAction } from "@/lib/actions/supplier-actions";
import { Button } from "@/components/ui/button";

interface SupplierValues {
  name: string;
  contactName: string;
  phone: string;
  email: string;
  countryOfOrigin: string;
  paymentTerms: string;
  defaultLeadDays: string;
  notes: string;
  isActive: boolean;
  // Phase 32 — supplier-level import defaults
  defaultAirFreightUsdPerKg: string;
  defaultSeaFreightUsdPerKg: string;
  defaultPaymentFeePct: string;
}

interface SupplierFormProps {
  /**
   * Pass null to create a new supplier; pass the supplier id to edit.
   */
  supplierId?: string | null;
  initialValues?: SupplierValues;
  onSuccess?: () => void;
}

const EMPTY: SupplierValues = {
  name: "",
  contactName: "",
  phone: "",
  email: "",
  countryOfOrigin: "",
  paymentTerms: "",
  defaultLeadDays: "",
  notes: "",
  isActive: true,
  defaultAirFreightUsdPerKg: "",
  defaultSeaFreightUsdPerKg: "",
  defaultPaymentFeePct: "",
};

export function SupplierForm({ supplierId, initialValues, onSuccess }: SupplierFormProps) {
  const id = supplierId ?? null;
  const init = initialValues ?? EMPTY;

  const [name, setName] = useState(init.name);
  const [contactName, setContactName] = useState(init.contactName);
  const [phone, setPhone] = useState(init.phone);
  const [email, setEmail] = useState(init.email);
  const [countryOfOrigin, setCountryOfOrigin] = useState(init.countryOfOrigin);
  const [paymentTerms, setPaymentTerms] = useState(init.paymentTerms);
  const [defaultLeadDays, setDefaultLeadDays] = useState(init.defaultLeadDays);
  const [notes, setNotes] = useState(init.notes);
  const [isActive, setIsActive] = useState(init.isActive);
  const [defaultAirFreight, setDefaultAirFreight] = useState(init.defaultAirFreightUsdPerKg);
  const [defaultSeaFreight, setDefaultSeaFreight] = useState(init.defaultSeaFreightUsdPerKg);
  const [defaultPaymentFee, setDefaultPaymentFee] = useState(init.defaultPaymentFeePct);

  const [result, setResult] = useState<{ ok: boolean; message?: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isDeleting, startDeleting] = useTransition();

  function handleSave() {
    setResult(null);
    startTransition(async () => {
      const res = await saveSupplierAction(id, {
        name,
        contactName,
        phone,
        email,
        countryOfOrigin,
        paymentTerms,
        defaultLeadDays,
        notes,
        isActive,
        defaultAirFreightUsdPerKg: defaultAirFreight,
        defaultSeaFreightUsdPerKg: defaultSeaFreight,
        defaultPaymentFeePct: defaultPaymentFee,
      });
      setResult(res);
      if (res.ok) {
        onSuccess ? onSuccess() : window.location.reload();
      }
    });
  }

  function handleDelete() {
    if (!id) return;
    if (!confirm("Bu tedarikçiyi silmek istediğinizden emin misiniz?")) return;
    setResult(null);
    startDeleting(async () => {
      const res = await deleteSupplierAction(id);
      setResult(res);
      if (res.ok) {
        onSuccess ? onSuccess() : window.location.reload();
      }
    });
  }

  const fieldClass =
    "w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400";
  const labelClass = "block text-xs font-medium text-slate-600 mb-1";

  return (
    <div className="space-y-4">
      {/* Row 1: name + contactName */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass}>
            Tedarikçi Adı <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            className={fieldClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Entegra Elektronik A.Ş."
          />
        </div>
        <div>
          <label className={labelClass}>İlgili Kişi</label>
          <input
            type="text"
            className={fieldClass}
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            placeholder="Ahmet Yılmaz"
          />
        </div>
      </div>

      {/* Row 2: phone + email */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Telefon</label>
          <input
            type="tel"
            className={fieldClass}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+90 212 000 00 00"
          />
        </div>
        <div>
          <label className={labelClass}>E-posta</label>
          <input
            type="email"
            className={fieldClass}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="satis@entegra.com.tr"
          />
        </div>
      </div>

      {/* Row 3: countryOfOrigin + paymentTerms + defaultLeadDays */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className={labelClass}>Menşei Ülke</label>
          <input
            type="text"
            className={fieldClass}
            value={countryOfOrigin}
            onChange={(e) => setCountryOfOrigin(e.target.value)}
            placeholder="Türkiye"
          />
        </div>
        <div>
          <label className={labelClass}>Ödeme Koşulları</label>
          <input
            type="text"
            className={fieldClass}
            value={paymentTerms}
            onChange={(e) => setPaymentTerms(e.target.value)}
            placeholder="30 gün vadeli"
          />
        </div>
        <div>
          <label className={labelClass}>Varsayılan Tedarik Süresi (gün)</label>
          <input
            type="number"
            className={fieldClass}
            value={defaultLeadDays}
            onChange={(e) => setDefaultLeadDays(e.target.value)}
            placeholder="7"
            min={1}
          />
        </div>
      </div>

      {/* Phase 32 — Import defaults */}
      <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-4 space-y-3">
        <p className="text-xs font-semibold text-blue-700">İthalat varsayılanları (opsiyonel)</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className={labelClass}>Hava kargo (USD/kg)</label>
            <input
              type="text"
              inputMode="decimal"
              className={fieldClass}
              value={defaultAirFreight}
              onChange={(e) => setDefaultAirFreight(e.target.value)}
              placeholder={`varsayılan: 8`}
            />
          </div>
          <div>
            <label className={labelClass}>Deniz kargo (USD/kg)</label>
            <input
              type="text"
              inputMode="decimal"
              className={fieldClass}
              value={defaultSeaFreight}
              onChange={(e) => setDefaultSeaFreight(e.target.value)}
              placeholder={`varsayılan: 1`}
            />
          </div>
          <div>
            <label className={labelClass}>Ödeme komisyonu (%)</label>
            <input
              type="text"
              inputMode="decimal"
              className={fieldClass}
              value={defaultPaymentFee}
              onChange={(e) => setDefaultPaymentFee(e.target.value)}
              placeholder="ör. 3.0"
            />
          </div>
        </div>
        <p className="text-xs text-blue-500">
          Boş bırakılırsa sistem varsayılanları kullanılır (hava: 8, deniz: 1 USD/kg).
          Ürün düzeyindeki girişler bu değerleri geçersiz kılar.
        </p>
      </div>

      {/* Notes */}
      <div>
        <label className={labelClass}>Notlar</label>
        <textarea
          className={`${fieldClass} resize-none`}
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Ek bilgiler, iletişim tercihleri..."
        />
      </div>

      {/* isActive toggle */}
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
        />
        <span className="text-sm text-slate-700">Aktif tedarikçi</span>
      </label>

      {/* Action row */}
      <div className="flex items-center gap-3 pt-2">
        <Button onClick={handleSave} disabled={isPending || isDeleting}>
          {isPending ? "Kaydediliyor..." : id ? "Güncelle" : "Tedarikçi Ekle"}
        </Button>
        {id && (
          <Button
            variant="secondary"
            onClick={handleDelete}
            disabled={isPending || isDeleting}
          >
            {isDeleting ? "Siliniyor..." : "Sil"}
          </Button>
        )}
        {result && (
          <span
            className={`text-xs font-medium ${result.ok ? "text-emerald-600" : "text-red-600"}`}
          >
            {result.ok ? "Kaydedildi." : result.message}
          </span>
        )}
      </div>
    </div>
  );
}
