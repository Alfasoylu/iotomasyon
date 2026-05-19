"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  saveHepsiburadaConfigAction,
  testHepsiburadaConnectionAction,
} from "@/lib/actions/hepsiburada-actions";

interface Props {
  initialValues: {
    merchantId: string;
    username: string;
    password: string;
    storeName: string;
    isEnabled: boolean;
  };
}

export function HepsiburadaConfigForm({ initialValues }: Props) {
  const [merchantId, setMerchantId] = useState(initialValues.merchantId);
  const [username, setUsername] = useState(initialValues.username);
  const [password, setPassword] = useState(initialValues.password);
  const [storeName, setStoreName] = useState(initialValues.storeName);
  const [isEnabled, setIsEnabled] = useState(initialValues.isEnabled);

  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [testOk, setTestOk] = useState(false);

  const [isSaving, startSave] = useTransition();
  const [isTesting, startTest] = useTransition();

  function handleSave() {
    setSaveMsg(null);
    setTestMsg(null);
    startSave(async () => {
      const result = await saveHepsiburadaConfigAction({
        merchantId,
        username,
        password,
        storeName,
        isEnabled,
      });
      setSaveOk(result.ok);
      setSaveMsg(result.ok ? "Yapılandırma kaydedildi." : (result.message ?? "Hata oluştu."));
    });
  }

  function handleTest() {
    setTestMsg(null);
    startTest(async () => {
      const result = await testHepsiburadaConnectionAction();
      setTestOk(result.ok);
      setTestMsg(result.connectionMessage ?? result.message ?? "");
    });
  }

  const labelCls = "block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 mb-1.5";
  const inputCls = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-300 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200";

  return (
    <div className="space-y-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className={labelCls}>Mağaza ID (Merchant ID)</label>
          <input
            type="text"
            value={merchantId}
            onChange={(e) => setMerchantId(e.target.value)}
            placeholder="UUID veya numerik ID"
            className={`${inputCls} font-mono`}
          />
          <p className="mt-1 text-xs text-slate-400">
            Mağaza Paneli → Entegrasyon → Entegratör Bilgileri sayfasında.
          </p>
        </div>
        <div>
          <label className={labelCls}>Mağaza Adı (opsiyonel)</label>
          <input
            type="text"
            value={storeName}
            onChange={(e) => setStoreName(e.target.value)}
            placeholder="alfasoylu"
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Kullanıcı Adı (Username)</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="entegratör kullanıcı adı"
            className={inputCls}
          />
          <p className="mt-1 text-xs text-slate-400">
            Servis Anahtarı oluştururken atanır (örn. entegratör adı).
          </p>
        </div>
        <div>
          <label className={labelCls}>Servis Anahtarı (Password)</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••••••"
            className={inputCls}
          />
        </div>
        <div className="flex flex-col justify-end sm:col-span-2">
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isEnabled}
              onChange={(e) => setIsEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-slate-800 focus:ring-slate-400"
            />
            <span className="text-sm text-slate-700">Hepsiburada entegrasyonu aktif</span>
          </label>
          <p className="mt-2 text-xs text-slate-400">
            Devre dışı bırakılırsa pano verisi gösterilmez. iotomasyon yalnızca okuma
            yapar; ürün/stok/fiyat push Entegra üzerinden gönderilir.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? "Kaydediliyor…" : "Kaydet"}
        </Button>
        <Button onClick={handleTest} disabled={isTesting} variant="ghost">
          {isTesting ? "Test ediliyor…" : "Bağlantıyı test et"}
        </Button>
      </div>

      {saveMsg && (
        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            saveOk ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {saveMsg}
        </div>
      )}
      {testMsg && (
        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            testOk ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-amber-50 text-amber-700 border border-amber-200"
          }`}
        >
          {testOk ? "✓ " : "⚠ "}
          {testMsg}
        </div>
      )}
    </div>
  );
}
