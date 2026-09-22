"use client";

/**
 * CFO Stok Sıçrama Yönetimi
 *
 * - cfo_stok_sicrama_durum: açıklanmayı bekleyen stok düşüşleri
 * - cfo_xml_urun_degisim:   XML feed'inde yakalanan alan değişimleri
 *
 * ACIK satırlarda "Açıkla" → cfo_sicrama_kapat() ile durum + açıklama yazılır.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SICRAMA_KAPATMA_DURUMLARI } from "@/lib/cfo/sicrama";

/** ⚠️ id ve adetler API'de text/int'e çevrilir (bigint JSON'a serialize edilemez). */
type SicramaRow = {
  id: string;
  sku: string | null;
  urun: string | null;
  hareket_gunu: string;
  onceki: number | null;
  yeni: number | null;
  delta: number | null;
  normal_gunluk_dusus: number | null;
  esik_nedeni: string | null;
  entegra_degisim_zamani: string | null;
  ty_adet: number | null;
  fba_adet: number | null;
  aciklanamayan_adet: number | null;
  aciklanamayan_maliyet_try: number | null;
  durum: string;
  aciklama: string | null;
  otomatik_teshis: string;
};

type XmlDegisimRow = {
  id: string;
  product_id: string | null;
  sku: string | null;
  alan: string;
  eski: string | null;
  yeni: string | null;
  entegra_degisim_zamani: string | null;
  yakalandi: string;
};

type BadgeVariant = "neutral" | "accent" | "ok" | "warn" | "danger" | "info";

const TESHIS: Record<string, { variant: BadgeVariant; label: string }> = {
  ACIKLANAMADI: { variant: "danger", label: "Açıklanamadı" },
  TOPLU_DUZELTME_SUPHESI: { variant: "warn", label: "Toplu düzeltme şüphesi" },
  BEKLIYOR_TRENDYOL_SENKRONU: { variant: "info", label: "Trendyol senkronu bekleniyor" },
  SATIS_ESLESTI: { variant: "ok", label: "Satışla eşleşti" },
  KAPANDI: { variant: "neutral", label: "Kapandı" },
};

const tl = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  maximumFractionDigits: 0,
});

function tarih(v: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleString("tr-TR");
}

export default function StokSicramaPage() {
  const [tab, setTab] = useState<"sicramalar" | "degisimler">("sicramalar");
  const [skuFilter, setSkuFilter] = useState("");
  const [durumFilter, setDurumFilter] = useState("ACIK");
  const [sicramalar, setSicramalar] = useState<SicramaRow[]>([]);
  const [degisimler, setDegisimler] = useState<XmlDegisimRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [hata, setHata] = useState<string | null>(null);

  const [yenileme, setYenileme] = useState(0);

  const [secili, setSecili] = useState<SicramaRow | null>(null);
  const [seciliDurum, setSeciliDurum] = useState("");
  const [aciklama, setAciklama] = useState("");
  const [kaydediliyor, setKaydediliyor] = useState(false);

  // `iptal` bayrağı: filtre hızlı değişirse geç gelen eski yanıt yenisini ezmesin.
  useEffect(() => {
    let iptal = false;

    (async () => {
      const [sicramaRes, degisimRes] = await Promise.all([
        fetch(`/api/cfo/stok-sicrama?durum=${encodeURIComponent(durumFilter)}`),
        fetch("/api/cfo/xml-degisim"),
      ]);
      if (!sicramaRes.ok || !degisimRes.ok) {
        throw new Error(
          sicramaRes.status === 403 || degisimRes.status === 403
            ? "Bu sayfayı görmek için CFO yetkisi gerekiyor."
            : "Veri yüklenemedi."
        );
      }
      return {
        sicramalar: (await sicramaRes.json()) as SicramaRow[],
        degisimler: (await degisimRes.json()) as XmlDegisimRow[],
      };
    })()
      .then((veri) => {
        if (iptal) return;
        setSicramalar(veri.sicramalar);
        setDegisimler(veri.degisimler);
        setHata(null);
        setLoading(false);
      })
      .catch((err: Error) => {
        if (iptal) return;
        console.error("[stok-sicrama] veri çekme hatası:", err);
        setHata(err.message || "Veri yüklenemedi.");
        setLoading(false);
      });

    return () => {
      iptal = true;
    };
  }, [durumFilter, yenileme]);

  const yenile = useCallback(() => {
    setLoading(true);
    setYenileme((n) => n + 1);
  }, []);

  const durumFiltresiniDegistir = (v: string) => {
    setLoading(true);
    setDurumFilter(v);
  };

  const filtered = useMemo(() => {
    const q = skuFilter.trim().toLowerCase();
    if (!q) return sicramalar;
    return sicramalar.filter(
      (s) =>
        (s.sku ?? "").toLowerCase().includes(q) ||
        (s.urun ?? "").toLowerCase().includes(q)
    );
  }, [sicramalar, skuFilter]);

  const modaliKapat = () => {
    setSecili(null);
    setSeciliDurum("");
    setAciklama("");
  };

  const handleAcikla = async () => {
    if (!secili || !seciliDurum) return;
    setKaydediliyor(true);
    try {
      const res = await fetch("/api/cfo/sicrama-kapat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: secili.id, durum: seciliDurum, aciklama }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setHata(body?.error ?? "İşlem başarısız oldu.");
        return;
      }
      modaliKapat();
      yenile();
    } catch (err) {
      console.error("[stok-sicrama] kapatma hatası:", err);
      setHata("İşlem başarısız oldu.");
    } finally {
      setKaydediliyor(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">CFO — Stok Sıçrama Yönetimi</h1>
        <p className="mt-1 text-gray-600">
          Hızlı stok düşüşlerini inceleyin ve sebebini kaydedin.
        </p>
      </div>

      {hata && (
        <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {hata}
        </Card>
      )}

      <div className="flex gap-2 border-b">
        {(
          [
            ["sicramalar", "Stok Sıçramaları"],
            ["degisimler", "XML Değişim Kayıtları"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 font-medium ${
              tab === key
                ? "border-b-2 border-blue-600 text-blue-600"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "sicramalar" && (
        <div className="space-y-4">
          <Card className="p-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label
                  htmlFor="durum-filtre"
                  className="mb-2 block text-sm font-medium"
                >
                  Durum
                </label>
                <select
                  id="durum-filtre"
                  value={durumFilter}
                  onChange={(e) => durumFiltresiniDegistir(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="ACIK">Açık</option>
                  <option value="">Tümü</option>
                </select>
              </div>
              <div>
                <label htmlFor="sku-ara" className="mb-2 block text-sm font-medium">
                  SKU / ürün araması
                </label>
                <Input
                  id="sku-ara"
                  placeholder="SKU veya ürün adı..."
                  value={skuFilter}
                  onChange={(e) => setSkuFilter(e.target.value)}
                />
              </div>
              <div className="flex items-end">
                <Button
                  onClick={yenile}
                  variant="secondary"
                  className="w-full"
                  disabled={loading}
                >
                  {loading ? "Yükleniyor..." : "Yenile"}
                </Button>
              </div>
            </div>
          </Card>

          {loading ? (
            <Card className="p-8 text-center text-gray-500">Yükleniyor...</Card>
          ) : filtered.length === 0 ? (
            <Card className="p-8 text-center text-gray-500">Kayıt bulunamadı.</Card>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="border-b bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold">Tarih</th>
                    <th className="px-4 py-2 text-left font-semibold">SKU</th>
                    <th className="px-4 py-2 text-left font-semibold">Ürün</th>
                    <th className="px-4 py-2 text-right font-semibold">Önceki</th>
                    <th className="px-4 py-2 text-right font-semibold">Yeni</th>
                    <th className="px-4 py-2 text-right font-semibold">Delta</th>
                    <th className="px-4 py-2 text-right font-semibold">TY</th>
                    <th className="px-4 py-2 text-right font-semibold">FBA</th>
                    <th className="px-4 py-2 text-right font-semibold">Açıklanamayan</th>
                    <th className="px-4 py-2 text-center font-semibold">Teşhis</th>
                    <th className="px-4 py-2 text-center font-semibold">İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => {
                    const t = TESHIS[row.otomatik_teshis] ?? {
                      variant: "neutral" as BadgeVariant,
                      label: row.otomatik_teshis || "—",
                    };
                    return (
                      <tr key={row.id} className="border-b hover:bg-gray-50">
                        <td className="px-4 py-2 text-xs text-gray-600">
                          {row.hareket_gunu}
                        </td>
                        <td className="px-4 py-2 font-mono text-xs">{row.sku ?? "—"}</td>
                        <td className="px-4 py-2 text-xs" title={row.urun ?? ""}>
                          {(row.urun ?? "").slice(0, 40)}
                        </td>
                        <td className="px-4 py-2 text-right text-xs">{row.onceki ?? "—"}</td>
                        <td className="px-4 py-2 text-right text-xs">{row.yeni ?? "—"}</td>
                        <td className="px-4 py-2 text-right text-xs font-semibold text-red-600">
                          {row.delta ?? "—"}
                        </td>
                        <td className="px-4 py-2 text-right text-xs">{row.ty_adet ?? 0}</td>
                        <td className="px-4 py-2 text-right text-xs">{row.fba_adet ?? 0}</td>
                        <td className="px-4 py-2 text-right text-xs">
                          <span className="font-semibold text-red-600">
                            {row.aciklanamayan_adet ?? 0}
                          </span>
                          <br />
                          <span className="text-gray-600">
                            {tl.format(row.aciklanamayan_maliyet_try ?? 0)}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-center">
                          <Badge variant={t.variant}>{t.label}</Badge>
                        </td>
                        <td className="px-4 py-2 text-center">
                          {row.durum === "ACIK" ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                setSecili(row);
                                setSeciliDurum("");
                                setAciklama("");
                              }}
                            >
                              Açıkla
                            </Button>
                          ) : (
                            <Badge variant="neutral">{row.durum}</Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "degisimler" && (
        <div className="space-y-4">
          {loading ? (
            <Card className="p-8 text-center text-gray-500">Yükleniyor...</Card>
          ) : degisimler.length === 0 ? (
            <Card className="p-8 text-center text-gray-500">Kayıt bulunamadı.</Card>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="border-b bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold">Yakalandı</th>
                    <th className="px-4 py-2 text-left font-semibold">SKU</th>
                    <th className="px-4 py-2 text-left font-semibold">Alan</th>
                    <th className="px-4 py-2 text-left font-semibold">Eski</th>
                    <th className="px-4 py-2 text-left font-semibold">Yeni</th>
                    <th className="px-4 py-2 text-left font-semibold">XML değişim zamanı</th>
                  </tr>
                </thead>
                <tbody>
                  {degisimler.map((row) => (
                    <tr key={row.id} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-2 text-xs text-gray-600">
                        {tarih(row.yakalandi)}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs">{row.sku ?? "—"}</td>
                      <td className="px-4 py-2 text-xs font-medium">{row.alan}</td>
                      <td className="px-4 py-2 text-xs text-gray-600" title={row.eski ?? ""}>
                        {(row.eski ?? "—").slice(0, 30)}
                      </td>
                      <td
                        className="px-4 py-2 text-xs font-semibold text-blue-600"
                        title={row.yeni ?? ""}
                      >
                        {(row.yeni ?? "—").slice(0, 30)}
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-600">
                        {row.entegra_degisim_zamani ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {secili && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sicrama-modal-baslik"
          onClick={modaliKapat}
        >
          <Card
            className="w-full max-w-md space-y-4 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h2 id="sicrama-modal-baslik" className="text-lg font-semibold">
                Stok sıçramasını kapat
              </h2>
              <p className="mt-1 text-sm text-gray-600">
                {secili.sku ?? "—"} · delta {secili.delta ?? "—"} ·{" "}
                {tl.format(secili.aciklanamayan_maliyet_try ?? 0)} açıklanamayan
              </p>
            </div>

            <div>
              <label htmlFor="kapatma-durumu" className="mb-2 block text-sm font-medium">
                Sebep
              </label>
              <select
                id="kapatma-durumu"
                value={seciliDurum}
                onChange={(e) => setSeciliDurum(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Seçin...</option>
                {SICRAMA_KAPATMA_DURUMLARI.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="kapatma-aciklama" className="mb-2 block text-sm font-medium">
                Açıklama
              </label>
              <Textarea
                id="kapatma-aciklama"
                placeholder="Bu düşüşün sebebi ne? Kısaca yazın..."
                value={aciklama}
                onChange={(e) => setAciklama(e.target.value)}
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={modaliKapat} disabled={kaydediliyor}>
                İptal
              </Button>
              <Button
                onClick={() => void handleAcikla()}
                disabled={kaydediliyor || !seciliDurum}
              >
                {kaydediliyor ? "Kaydediliyor..." : "Kaydet"}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
