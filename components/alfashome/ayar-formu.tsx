"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  saveAlfashomeConfigAction,
  testAlfashomeConnectionAction,
} from "@/lib/actions/alfashome-actions";

/**
 * ALFAS Home bağlantı formu — adres + salt okunur CRM jetonu.
 *
 * ⚠️ KAYITLI JETON TARAYICIYA GELMEZ. Form yalnız "kayıtlı mı" ve son 4 haneyi
 * biliyor (`tokenIpucu`); alan BOŞ başlar ve boş bırakılırsa sunucu mevcut
 * jetona dokunmaz. Trendyol formu kayıtlı anahtarı `initialValues` ile geri
 * basıyor; burada o desen bilerek tekrarlanmadı — sırrı her sayfa
 * görüntülemesinde HTML'e gömmek gereksiz bir sızıntı yüzeyi.
 *
 * "Bağlantıyı dene" düğmesi ayrı: KAYDETMEK ile ÇALIŞMAK aynı şey değil.
 * Yanlış jeton da kaydedilir; çalıştığını yalnız deneme gösterir.
 */
export function AlfasAyarFormu({
  initialValues,
}: {
  initialValues: { baseUrl: string; isEnabled: boolean; tokenVar: boolean; tokenIpucu: string };
}) {
  const [baseUrl, setBaseUrl] = useState(initialValues.baseUrl);
  const [token, setToken] = useState("");
  const [isEnabled, setIsEnabled] = useState(initialValues.isEnabled);

  const [kayitMsg, setKayitMsg] = useState<string | null>(null);
  const [kayitOk, setKayitOk] = useState(false);
  const [denemeMsg, setDenemeMsg] = useState<string | null>(null);
  const [denemeOk, setDenemeOk] = useState(false);

  const [kaydediyor, startKayit] = useTransition();
  const [deniyor, startDeneme] = useTransition();

  function kaydet() {
    setKayitMsg(null);
    setDenemeMsg(null);
    startKayit(async () => {
      const r = await saveAlfashomeConfigAction({ baseUrl, token, isEnabled });
      setKayitOk(r.ok);
      setKayitMsg(r.ok ? "Ayar kaydedildi." : (r.message ?? "Hata oluştu."));
      // Kaydedilen jeton formda tutulmaz: bir daha gönderilmesi gerekmiyor ve
      // ekranda açık kalması gereksiz.
      if (r.ok) setToken("");
    });
  }

  function dene() {
    setDenemeMsg(null);
    startDeneme(async () => {
      const r = await testAlfashomeConnectionAction();
      setDenemeOk(r.ok);
      setDenemeMsg(r.connectionMessage ?? r.message ?? "");
    });
  }

  const labelCls =
    "block text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)] mb-1.5";
  const inputCls =
    "w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-1)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-[var(--accent-border)] focus:outline-none";
  const ipucuCls = "mt-1 text-xs text-[var(--text-tertiary)]";

  return (
    <div className="space-y-6">
      <div className="space-y-5">
        <div>
          <label className={labelCls} htmlFor="alfas-url">
            ALFAS arka uç adresi
          </label>
          <input
            id="alfas-url"
            type="url"
            inputMode="url"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://alfashome-production.up.railway.app"
            className={inputCls}
          />
          <p className={ipucuCls}>
            Medusa arka ucunun adresi. <strong>https</strong> zorunlu: jeton istek başlığında
            gidiyor, şifresiz bağlantıda ağı dinleyen okur.
          </p>
        </div>

        <div>
          <label className={labelCls} htmlFor="alfas-token">
            CRM jetonu {initialValues.tokenVar && <span className="normal-case tracking-normal text-[var(--ok)]">· kayıtlı {initialValues.tokenIpucu}</span>}
          </label>
          <input
            id="alfas-token"
            type="password"
            autoComplete="new-password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={initialValues.tokenVar ? "Değiştirmek için yeni jetonu yazın" : "En az 24 karakter"}
            className={inputCls}
          />
          <p className={ipucuCls}>
            ALFAS tarafında <code>CRM_API_TOKEN</code> ile <strong>birebir aynı</strong> olmalı.
            {initialValues.tokenVar
              ? " Boş bırakırsanız kayıtlı jeton korunur."
              : " Rastgele 32+ karakter önerilir; ALFAS 24 karakterden kısa jetonu reddeder."}
          </p>
        </div>

        <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={isEnabled}
            onChange={(e) => setIsEnabled(e.target.checked)}
            className="h-4 w-4"
          />
          Bağlantı aktif (kapatılırsa sipariş ve üye sayfaları veri çekmez)
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={kaydet} disabled={kaydediyor}>
          {kaydediyor ? "Kaydediliyor…" : "Kaydet"}
        </Button>
        <Button variant="secondary" onClick={dene} disabled={deniyor}>
          {deniyor ? "Deneniyor…" : "Bağlantıyı dene"}
        </Button>
      </div>

      {kayitMsg && (
        <p className="text-sm" style={{ color: kayitOk ? "var(--ok)" : "var(--danger)" }}>
          {kayitMsg}
        </p>
      )}
      {denemeMsg && (
        <p className="text-sm" style={{ color: denemeOk ? "var(--ok)" : "var(--danger)" }}>
          {denemeMsg}
        </p>
      )}
    </div>
  );
}
