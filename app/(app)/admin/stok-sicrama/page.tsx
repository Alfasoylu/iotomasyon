"use client";

/**
 * CFO Stok Sıçrama Yönetimi
 *
 * Veritabanındaki CFO nesnelerini yönetir:
 * - cfo_stok_sicrama: Açık stok sıçramaları
 * - cfo_xml_urun_degisim: XML feed değişim kayıtları
 *
 * Durum: ACIK satırlarında "Açıkla" butonu ile durum değiştirme.
 */

import { useState, useMemo } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { tr } from "date-fns/locale";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

type SicramaRow = {
  id: bigint;
  sku: string | null;
  urun: string | null;
  hareket_gunu: string;
  onceki: number | null;
  yeni: number | null;
  delta: number | null;
  normal_gunluk_dusus: number | null;
  esik_nedeni: string | null;
  entegra_degisim_zamani: string | null;
  ty_adet: bigint;
  fba_adet: bigint;
  aciklanamayan_adet: bigint;
  aciklanamayan_maliyet_try: number | null;
  durum: string;
  aciklama: string | null;
  otomatik_teshis: string;
};

type XmlDegisimRow = {
  id: bigint;
  product_id: string | null;
  sku: string | null;
  alan: string;
  eski: string | null;
  yeni: string | null;
  entegra_degisim_zamani: string | null;
  yakalandi: string;
};

const DURUM_OPTIONS = [
  { value: "SATIS", label: "Satış" },
  { value: "TOPLU_SATIS", label: "Toplu Satış" },
  { value: "FBA_GONDERIM", label: "FBA Gönderimi" },
  { value: "SAYIM_DUZELTME", label: "Sayım Düzeltme" },
  { value: "IADE_IPTAL", label: "İade/İptal" },
  { value: "TRANSFER_BASKA_SKU", label: "Transfer/Başka SKU" },
  { value: "DIGER", label: "Diğer" },
];

const TESHIS_BADGE = {
  ACIKLANAMADI: { color: "bg-red-100 text-red-800", label: "AÇIKLANAMADI" },
  TOPLU_DUZELTME_SUPHESI: { color: "bg-orange-100 text-orange-800", label: "TOPLU DÜZELTME ŞÜPHESİ" },
  BEKLIYOR_TRENDYOL_SENKRONU: { color: "bg-gray-100 text-gray-800", label: "BEKLENIYOR (TY SENKRON)" },
  SATIS_ESLESTI: { color: "bg-green-100 text-green-800", label: "SATIŞ EŞLEŞTI" },
  KAPANDI: { color: "bg-gray-200 text-gray-700", label: "KAPANDI" },
};

export default function StokSicramaPage() {
  const [tab, setTab] = useState<"sicramalar" | "degisimler">("sicramalar");
  const [skuFilter, setSkuFilter] = useState("");
  const [durumFilter, setDurumFilter] = useState("ACIK");
  const [sicramalar, setSicramalar] = useState<SicramaRow[]>([]);
  const [degisimler, setDegisimler] = useState<XmlDegisimRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedSicrama, setSelectedSicrama] = useState<SicramaRow | null>(null);
  const [selectedDurum, setSelectedDurum] = useState("");
  const [aciklama, setAciklama] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Sayfa yüklendiğinde veri çek
  React.useEffect(() => {
    fetchData();
  }, [durumFilter]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [sicramaRes, degisimRes] = await Promise.all([
        fetch(
          `/api/cfo/stok-sicrama?durum=${encodeURIComponent(durumFilter)}`
        ),
        fetch("/api/cfo/xml-degisim"),
      ]);

      if (sicramaRes.ok) {
        const data = await sicramaRes.json();
        setSicramalar(data || []);
      }

      if (degisimRes.ok) {
        const data = await degisimRes.json();
        setDegisimler(data || []);
      }
    } catch (err) {
      console.error("Veri çekme hatası:", err);
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    return sicramalar.filter((s) =>
      (s.sku || "").toLowerCase().includes(skuFilter.toLowerCase())
    );
  }, [sicramalar, skuFilter]);

  const handleAcikla = async () => {
    if (!selectedSicrama || !selectedDurum) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/cfo/sicrama-kapat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedSicrama.id,
          durum: selectedDurum,
          aciklama: aciklama || "",
        }),
      });

      if (res.ok) {
        setDialogOpen(false);
        setSelectedSicrama(null);
        setSelectedDurum("");
        setAciklama("");
        await fetchData();
      } else {
        alert("Hata: İşlem başarısız oldu");
      }
    } catch (err) {
      console.error("İşlem hatası:", err);
      alert("Hata oluştu");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">CFO — Stok Sıçrama Yönetimi</h1>
        <p className="text-gray-600 mt-1">
          Hızlı stok değişimlerini inceleyin ve açıklamalarını kaydedin.
        </p>
      </div>

      {/* Tab Seçimi */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setTab("sicramalar")}
          className={`px-4 py-2 font-medium ${
            tab === "sicramalar"
              ? "text-blue-600 border-b-2 border-blue-600"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          Stok Sıçramaları
        </button>
        <button
          onClick={() => setTab("degisimler")}
          className={`px-4 py-2 font-medium ${
            tab === "degisimler"
              ? "text-blue-600 border-b-2 border-blue-600"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          XML Değişim Kayıtları
        </button>
      </div>

      {/* SEKME 1: STOK SICIRAMALAR */}
      {tab === "sicramalar" && (
        <div className="space-y-4">
          {/* Filtreler */}
          <Card className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Durum</label>
                <Select value={durumFilter} onValueChange={setDurumFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACIK">Açık</SelectItem>
                    <SelectItem value="">Tümü</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">SKU Araması</label>
                <Input
                  placeholder="SKU yazın..."
                  value={skuFilter}
                  onChange={(e) => setSkuFilter(e.target.value)}
                />
              </div>
              <div className="flex items-end">
                <Button
                  onClick={fetchData}
                  variant="outline"
                  className="w-full"
                  disabled={loading}
                >
                  {loading ? "Yükleniyor..." : "Yenile"}
                </Button>
              </div>
            </div>
          </Card>

          {/* Tablo */}
          {loading ? (
            <Card className="p-8 text-center text-gray-500">
              Yükleniyor...
            </Card>
          ) : filtered.length === 0 ? (
            <Card className="p-8 text-center text-gray-500">
              Kayıt bulunamadı.
            </Card>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold">Tarih</th>
                    <th className="px-4 py-2 text-left font-semibold">SKU</th>
                    <th className="px-4 py-2 text-left font-semibold">Ürün</th>
                    <th className="px-4 py-2 text-right font-semibold">Önceki</th>
                    <th className="px-4 py-2 text-right font-semibold">Yeni</th>
                    <th className="px-4 py-2 text-right font-semibold">Delta</th>
                    <th className="px-4 py-2 text-right font-semibold">TY Adet</th>
                    <th className="px-4 py-2 text-right font-semibold">FBA Adet</th>
                    <th className="px-4 py-2 text-right font-semibold">Açıklanamayan</th>
                    <th className="px-4 py-2 text-center font-semibold">Teşhis</th>
                    <th className="px-4 py-2 text-center font-semibold">İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => (
                    <tr key={row.id} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-2 text-xs text-gray-600">
                        {row.hareket_gunu}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs">{row.sku}</td>
                      <td className="px-4 py-2 text-xs">{(row.urun || "").substring(0, 40)}</td>
                      <td className="px-4 py-2 text-right text-xs">{row.onceki}</td>
                      <td className="px-4 py-2 text-right text-xs">{row.yeni}</td>
                      <td className="px-4 py-2 text-right text-xs font-semibold text-red-600">
                        {row.delta}
                      </td>
                      <td className="px-4 py-2 text-right text-xs">{row.ty_adet.toString()}</td>
                      <td className="px-4 py-2 text-right text-xs">{row.fba_adet.toString()}</td>
                      <td className="px-4 py-2 text-right text-xs">
                        <span className="text-red-600 font-semibold">
                          {row.aciklanamayan_adet.toString()}
                        </span>
                        <br />
                        <span className="text-gray-600">
                          ₺{row.aciklanamayan_maliyet_try || 0}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-center">
                        {(() => {
                          const badge =
                            TESHIS_BADGE[
                              row.otomatik_teshis as keyof typeof TESHIS_BADGE
                            ] || TESHIS_BADGE.ACIKLANAMADI;
                          return (
                            <span className={`text-xs px-2 py-1 rounded ${badge.color}`}>
                              {badge.label}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-2 text-center">
                        {row.durum === "ACIK" ? (
                          <Dialog open={dialogOpen && selectedSicrama?.id === row.id} onOpenChange={setDialogOpen}>
                            <DialogTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setSelectedSicrama(row);
                                  setSelectedDurum("");
                                  setAciklama("");
                                }}
                              >
                                Açıkla
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Stok Sıçramasını Kapatın</DialogTitle>
                                <DialogDescription>
                                  SKU: {row.sku} | Delta: {row.delta}
                                </DialogDescription>
                              </DialogHeader>
                              <div className="space-y-4">
                                <div>
                                  <label className="block text-sm font-medium mb-2">
                                    Durum
                                  </label>
                                  <Select
                                    value={selectedDurum}
                                    onValueChange={setSelectedDurum}
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Seçin..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {DURUM_OPTIONS.map((opt) => (
                                        <SelectItem key={opt.value} value={opt.value}>
                                          {opt.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <label className="block text-sm font-medium mb-2">
                                    Açıklama
                                  </label>
                                  <Textarea
                                    placeholder="Neden bu stok sıçraması oldu? Detay yazın..."
                                    value={aciklama}
                                    onChange={(e) => setAciklama(e.target.value)}
                                    rows={3}
                                  />
                                </div>
                                <div className="flex justify-end gap-2">
                                  <Button
                                    variant="outline"
                                    onClick={() => setDialogOpen(false)}
                                  >
                                    İptal
                                  </Button>
                                  <Button
                                    onClick={handleAcikla}
                                    disabled={submitting || !selectedDurum}
                                  >
                                    {submitting ? "Kaydediliyor..." : "Kaydet"}
                                  </Button>
                                </div>
                              </div>
                            </DialogContent>
                          </Dialog>
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            {row.durum}
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* SEKME 2: XML DEĞIŞIM KAYITLARI */}
      {tab === "degisimler" && (
        <div className="space-y-4">
          {loading ? (
            <Card className="p-8 text-center text-gray-500">
              Yükleniyor...
            </Card>
          ) : degisimler.length === 0 ? (
            <Card className="p-8 text-center text-gray-500">
              Kayıt bulunamadı.
            </Card>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold">Yakalandı</th>
                    <th className="px-4 py-2 text-left font-semibold">SKU</th>
                    <th className="px-4 py-2 text-left font-semibold">Alan</th>
                    <th className="px-4 py-2 text-left font-semibold">Eski Değer</th>
                    <th className="px-4 py-2 text-left font-semibold">Yeni Değer</th>
                    <th className="px-4 py-2 text-left font-semibold">XML Değişim Zamanı</th>
                  </tr>
                </thead>
                <tbody>
                  {degisimler.map((row) => (
                    <tr key={row.id} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-2 text-xs text-gray-600">
                        {new Date(row.yakalandi).toLocaleString("tr-TR")}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs">{row.sku}</td>
                      <td className="px-4 py-2 text-xs font-medium">{row.alan}</td>
                      <td className="px-4 py-2 text-xs text-gray-600">
                        {(row.eski || "—").substring(0, 30)}
                      </td>
                      <td className="px-4 py-2 text-xs font-semibold text-blue-600">
                        {(row.yeni || "—").substring(0, 30)}
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-600">
                        {row.entegra_degisim_zamani || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
