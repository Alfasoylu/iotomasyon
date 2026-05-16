"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { saveTrendyolConfigAction, testTrendyolConnectionAction } from "@/lib/actions/trendyol-actions";

interface Props {
  initialValues: {
    supplierId: string;
    apiKey: string;
    apiSecret: string;
    isEnabled: boolean;
  };
}

export function TrendyolConfigForm({ initialValues }: Props) {
  const [supplierId, setSupplierId] = useState(initialValues.supplierId);
  const [apiKey, setApiKey] = useState(initialValues.apiKey);
  const [apiSecret, setApiSecret] = useState(initialValues.apiSecret);
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
      const result = await saveTrendyolConfigAction({ supplierId, apiKey, apiSecret, isEnabled });
      setSaveOk(result.ok);
      setSaveMsg(result.ok ? "Yapılandırma kaydedildi." : (result.message ?? "Hata oluştu."));
    });
  }

  function handleTest() {
    setTestMsg(null);
    startTest(async () => {
      const result = await testTrendyolConnectionAction();
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
          <label className={labelCls}>Satıcı ID (Supplier ID)</label>
          <input
            type="text"
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            placeholder="123456"
            className={inputCls}
          />
          <p className="mt-1 text-xs text-slate-400">Trendyol Satıcı Paneli → Hesap bilgilerinizde bulunur.</p>
        </div>
        <div>
          <label className={labelCls}>API Anahtarı</label>
          <input
            type="text"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="API anahtarınız"
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>API Gizli Anahtarı</label>
          <input
            type="password"
            value={apiSecret}
            onChange={(e) => setApiSecret(e.target.value)}
            placeholder="••••••••••••"
            className={inputCls}
          />
        </div>
        <div className="flex flex-col justify-end">
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isEnabled}
              onChange={(e) => setIsEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-slate-800 focus:ring-slate-400"
            />
            <span className="text-sm text-slate-700">Trendyol entegrasyonu aktif</span>
          </label>
          <p className="mt-2 text-xs text-slate-400">
            Devre dışı bırakılırsa pano verisi gösterilmez.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? "Kaydediliyor…" : "Kaydet"}
        </Button>
        <Button variant="secondary" onClick={handleTest} disabled={isTesting}>
          {isTesting ? "Test ediliyor…" : "Bağlantıyı test et"}
        </Button>

        {saveMsg && (
          <span className={`text-sm font-medium ${saveOk ? "text-emerald-600" : "text-red-600"}`}>
            {saveOk ? "✓ " : "✗ "}{saveMsg}
          </span>
        )}
        {testMsg && (
          <span className={`text-sm font-medium ${testOk ? "text-emerald-600" : "text-red-600"}`}>
            {testOk ? "✓ " : "✗ "}{testMsg}
          </span>
        )}
      </div>

      <div className="rounded-xl bg-amber-50 border border-amber-100 p-4 text-xs text-amber-700 space-y-1">
        <p className="font-semibold">Güvenlik notu</p>
        <p>API anahtarları sunucu tarafında şifrelenmeden saklanır. Yalnızca okuma (read-only) yetkisine sahip API anahtarı kullanın. Yazma işlemleri bu entegrasyon kapsamı dışındadır.</p>
      </div>
    </div>
  );
}
