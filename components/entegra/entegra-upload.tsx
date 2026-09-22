"use client";

/**
 * Entegra satış yükleme: dosya → ÖNİZLEME → onay → yaz.
 *
 * ⛔ Onay olmadan tek satır yazılmaz. "Önizle" ucu hiçbir şey yazmaz; "Yaz"
 * düğmesi ancak önizleme geldikten sonra etkinleşir ve önizlemeden dönen
 * fileHash'i geri gönderir — sunucu dosyanın değişmediğini orada doğrular.
 */

import { useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface DurumDegisimi {
  sku: string | null;
  orderNumber: string;
  eski: string;
  yeni: string;
  iadeyeDondu: boolean;
}

interface Onizleme {
  toplamSatir: number;
  yeni: number;
  guncellenecek: number;
  durumuDegisecek: number;
  iadeyeDonecek: number;
  tutariDegisecek: number;
  adediDegisecek: number;
  eslesmeyenUrun: number;
  eslesmeyenOrnek: { model: string | null; urun: string | null; adet: number }[];
  durumOrnek: DurumDegisimi[];
  tarihBas: string | null;
  tarihSon: string | null;
  atlanan: number;
  dosyaIciMukerrer: number;
}

interface OnizlemeYanit {
  fileHash: string;
  fileName: string;
  onizleme: Onizleme;
  atlananOrnek: { satir: number; sebep: string }[];
}

interface Sonuc {
  yeni: number;
  guncellenen: number;
  atlanan: number;
  sureMs: number;
  tarihBas: string | null;
  tarihSon: string | null;
}

function Sayi({ etiket, deger, vurgu }: { etiket: string; deger: number; vurgu?: "danger" | "ok" | "warn" }) {
  const renk =
    vurgu === "danger" ? "text-[var(--danger)]" : vurgu === "ok" ? "text-[var(--ok)]" : vurgu === "warn" ? "text-[var(--warn)]" : "text-[var(--text-primary)]";
  return (
    <div className="rounded-md border border-[var(--border-default)] bg-[var(--surface-2)] p-3">
      <p className="text-[10px] font-medium uppercase tracking-widest text-[var(--text-muted)]">{etiket}</p>
      <p className={`mt-1 text-[20px] font-semibold tabular-nums ${renk}`}>{deger.toLocaleString("tr-TR")}</p>
    </div>
  );
}

export function EntegraUpload() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dosya, setDosya] = useState<File | null>(null);
  const [onizleme, setOnizleme] = useState<OnizlemeYanit | null>(null);
  const [sonuc, setSonuc] = useState<Sonuc | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [mesgul, setMesgul] = useState<false | "onizle" | "yaz">(false);

  function dosyaSecildi(f: File | null) {
    setDosya(f);
    // Yeni dosya eski önizlemeyi geçersiz kılar — yoksa A dosyasının onayıyla
    // B dosyası yazılmaya çalışılırdı (sunucu da reddeder, ama kullanıcı
    // sebebini anlamazdı).
    setOnizleme(null);
    setSonuc(null);
    setHata(null);
  }

  async function gonder(uc: "onizleme" | "uygula") {
    if (!dosya) return;
    setMesgul(uc === "onizleme" ? "onizle" : "yaz");
    setHata(null);
    try {
      const fd = new FormData();
      fd.append("file", dosya);
      if (uc === "uygula") {
        if (!onizleme) return;
        fd.append("fileHash", onizleme.fileHash);
      }
      const res = await fetch(`/api/admin/entegra-yukleme/${uc}`, { method: "POST", body: fd });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setHata(body?.error ?? "İşlem başarısız.");
        if (res.status === 409) setOnizleme(null);
        return;
      }
      if (uc === "onizleme") setOnizleme(body as OnizlemeYanit);
      else {
        setSonuc(body as Sonuc);
        setOnizleme(null);
        setDosya(null);
        if (inputRef.current) inputRef.current.value = "";
      }
    } catch (err) {
      console.error("[entegra-upload]", err);
      setHata("Ağ hatası — işlem tamamlanamadı.");
    } finally {
      setMesgul(false);
    }
  }

  const o = onizleme?.onizleme;

  return (
    <div className="space-y-5">
      <Card className="space-y-4 p-6">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Dosya</p>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Entegra → <strong>sipariş dışa aktarım</strong> dosyası (.xlsx veya .csv). Dosyadaki{" "}
            <strong>tüm satırlar</strong> işlenir, yalnız yeni günler değil.
          </p>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={(e) => dosyaSecildi(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-[var(--text-secondary)] file:mr-3 file:rounded-md file:border-0 file:bg-[var(--accent)] file:px-3 file:py-2 file:text-[13px] file:font-medium file:text-[var(--accent-fg)]"
        />

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void gonder("onizleme")} disabled={!dosya || mesgul !== false}>
            {mesgul === "onizle" ? "Okunuyor..." : "Önizle"}
          </Button>
          <Button
            variant="danger"
            onClick={() => void gonder("uygula")}
            disabled={!onizleme || mesgul !== false}
            title={onizleme ? undefined : "Önce önizleme alın"}
          >
            {mesgul === "yaz" ? "Yazılıyor..." : "Onayla ve yaz"}
          </Button>
        </div>
        <p className="text-xs text-[var(--text-muted)]">
          Önizleme hiçbir şey yazmaz. Yazma yalnız &quot;Onayla ve yaz&quot; ile olur.
        </p>
      </Card>

      {hata && (
        <Card className="border-[var(--danger-border)] bg-[var(--danger-dim)] p-4 text-sm text-[var(--danger)]">
          {hata}
        </Card>
      )}

      {sonuc && (
        <Card className="border-[var(--ok-border)] bg-[var(--ok-dim)] p-5 space-y-2">
          <p className="text-sm font-semibold text-[var(--ok)]">Yükleme tamamlandı</p>
          <p className="text-sm text-[var(--text-secondary)] tabular-nums">
            {sonuc.yeni.toLocaleString("tr-TR")} yeni · {sonuc.guncellenen.toLocaleString("tr-TR")} güncellendi ·{" "}
            {sonuc.atlanan.toLocaleString("tr-TR")} atlandı · {(sonuc.sureMs / 1000).toFixed(1)} sn
            {sonuc.tarihBas && ` · ${sonuc.tarihBas} → ${sonuc.tarihSon}`}
          </p>
        </Card>
      )}

      {o && (
        <Card className="space-y-5 p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Önizleme</p>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                <span className="font-mono">{onizleme.fileName}</span>
                {o.tarihBas && (
                  <>
                    {" · "}
                    <span className="tabular-nums">
                      {o.tarihBas} → {o.tarihSon}
                    </span>
                  </>
                )}
              </p>
            </div>
            <Badge variant="info">Henüz hiçbir şey yazılmadı</Badge>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Sayi etiket="Toplam satır" deger={o.toplamSatir} />
            <Sayi etiket="Yeni" deger={o.yeni} vurgu="ok" />
            <Sayi etiket="Güncellenecek" deger={o.guncellenecek} />
            <Sayi etiket="Durumu değişecek" deger={o.durumuDegisecek} vurgu={o.durumuDegisecek ? "warn" : undefined} />
            <Sayi etiket="İadeye dönecek" deger={o.iadeyeDonecek} vurgu={o.iadeyeDonecek ? "danger" : undefined} />
            <Sayi etiket="Tutarı değişecek" deger={o.tutariDegisecek} />
            <Sayi etiket="Adedi değişecek" deger={o.adediDegisecek} />
            <Sayi etiket="Ürün eşleşmeyen" deger={o.eslesmeyenUrun} vurgu={o.eslesmeyenUrun ? "warn" : undefined} />
          </div>

          {(o.atlanan > 0 || o.dosyaIciMukerrer > 0) && (
            <p className="text-xs text-[var(--text-muted)]">
              {o.atlanan > 0 && `${o.atlanan} satır atlandı (zorunlu alan boş). `}
              {o.dosyaIciMukerrer > 0 &&
                `${o.dosyaIciMukerrer} satır dosya içinde mükerrer — her anahtar için son satır kullanılacak.`}
            </p>
          )}

          {o.iadeyeDonecek > 0 && (
            <Card className="border-[var(--danger-border)] bg-[var(--danger-dim)] p-4">
              <p className="text-sm font-semibold text-[var(--danger)]">
                {o.iadeyeDonecek} sipariş iade/iptale dönüyor
              </p>
              <p className="mt-1 text-xs text-[var(--danger)] opacity-90">
                Geçmiş bir aktarımda 21 iade 12 gün boyunca satış sayılmıştı. Yazmadan önce bu listeye bakın.
              </p>
            </Card>
          )}

          {o.durumOrnek.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
                Durum değişiklikleri (ilk {o.durumOrnek.length})
              </p>
              <div className="overflow-x-auto rounded-md border border-[var(--border-subtle)]">
                <table className="w-full text-xs">
                  <thead className="bg-[var(--surface-1)]">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-[var(--text-muted)]">Sipariş</th>
                      <th className="px-3 py-2 text-left font-medium text-[var(--text-muted)]">Model</th>
                      <th className="px-3 py-2 text-left font-medium text-[var(--text-muted)]">Eski</th>
                      <th className="px-3 py-2 text-left font-medium text-[var(--text-muted)]">Yeni</th>
                    </tr>
                  </thead>
                  <tbody>
                    {o.durumOrnek.map((d, i) => (
                      <tr
                        key={`${d.orderNumber}-${i}`}
                        className={`border-t border-[var(--border-subtle)] ${d.iadeyeDondu ? "bg-[var(--danger-dim)]" : ""}`}
                      >
                        <td className="px-3 py-1.5 font-mono tabular-nums">{d.orderNumber}</td>
                        <td className="px-3 py-1.5 font-mono">{d.sku ?? "—"}</td>
                        <td className="px-3 py-1.5 text-[var(--text-muted)]">{d.eski}</td>
                        <td className={`px-3 py-1.5 font-medium ${d.iadeyeDondu ? "text-[var(--danger)]" : ""}`}>
                          {d.yeni}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {o.eslesmeyenOrnek.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
                Ürünle eşleşmeyenler (ilk {o.eslesmeyenOrnek.length} model)
              </p>
              <div className="overflow-x-auto rounded-md border border-[var(--border-subtle)]">
                <table className="w-full text-xs">
                  <thead className="bg-[var(--surface-1)]">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-[var(--text-muted)]">Model</th>
                      <th className="px-3 py-2 text-left font-medium text-[var(--text-muted)]">Ürün adı</th>
                      <th className="px-3 py-2 text-right font-medium text-[var(--text-muted)]">Satır</th>
                    </tr>
                  </thead>
                  <tbody>
                    {o.eslesmeyenOrnek.map((e, i) => (
                      <tr key={`${e.model ?? "yok"}-${i}`} className="border-t border-[var(--border-subtle)]">
                        <td className="px-3 py-1.5 font-mono">{e.model ?? "—"}</td>
                        <td className="px-3 py-1.5 text-[var(--text-secondary)]">{(e.urun ?? "—").slice(0, 60)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{e.adet}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-[var(--text-muted)]">
                Eşleşmeyen satırlar yine yazılır; yalnız <code>productId</code> boş kalır. Ürün bağı sonradan
                düzeltilebilir — uydurma eşleştirme yapılmaz.
              </p>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
