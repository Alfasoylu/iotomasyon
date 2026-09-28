"use client";

/**
 * Banka hareketleri yükleme: banka seç → dosya → ÖNİZLEME → (gerekirse elle
 * sütun eşleme) → onay → yaz.
 *
 * ⛔ Onay olmadan tek satır yazılmaz — aynı desen Entegra yüklemesiyle
 * (`components/entegra/entegra-upload.tsx`). "Önizle" ucu hiçbir şey yazmaz;
 * "Onayla ve yaz" düğmesi ancak tam bir önizleme geldikten sonra etkinleşir ve
 * önizlemeden dönen `fileHash` + `onayAnahtari`'nı (banka + sütun eşlemesini
 * de kapsar) geri gönderir — sunucu üçünün de değişmediğini orada doğrular.
 */

import { useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type BankaAlan =
  | "tarih"
  | "valor"
  | "aciklama"
  | "tutar"
  | "borc"
  | "alacak"
  | "bakiye"
  | "karsiTaraf"
  | "refNo"
  | "hesap";

const ALAN_SIRASI: BankaAlan[] = [
  "tarih",
  "aciklama",
  "tutar",
  "borc",
  "alacak",
  "valor",
  "bakiye",
  "karsiTaraf",
  "refNo",
  "hesap",
];

const ZORUNLU_GOSTER: BankaAlan[] = ["tarih", "aciklama", "tutar"];

interface BuyukHareket {
  tarih: string;
  aciklama: string;
  tutarTry: number;
  karsiTaraf: string | null;
}

interface BankaOnizleme {
  banka: string;
  hesap: string | null;
  toplamSatir: number;
  yeni: number;
  zatenVar: number;
  toplamGiris: number;
  toplamCikis: number;
  net: number;
  dosyaTarihBas: string | null;
  dosyaTarihSon: string | null;
  dosyaSonBakiye: number | null;
  defterBakiye: number | null;
  bakiyeFarki: number | null;
  buyukHareketler: BuyukHareket[];
  tarihBoslugu: { bas: string; son: string } | null;
  atlanan: number;
}

interface OnizlemeYaniti {
  needsMapping: boolean;
  // needsMapping: true
  basliklar?: string[];
  ilkSatirlar?: string[][];
  eslesen: Partial<Record<BankaAlan, string>>;
  eksikZorunlu?: BankaAlan[];
  alanEtiketleri?: Record<BankaAlan, string>;
  // needsMapping: false
  fileHash?: string;
  onayAnahtari?: string;
  fileName?: string;
  banka?: string;
  eslesmeyenSutunlar?: string[];
  onizleme?: BankaOnizleme;
  atlananOrnek?: { satir: number; sebep: string }[];
}

interface Sonuc {
  eklenen: number;
  atlananMukerrer: number;
  atlananGecersiz: number;
  sureMs: number;
  tarihBas: string | null;
  tarihSon: string | null;
  dosyaSonBakiye: number | null;
  defterBakiye: number | null;
  bakiyeFarki: number | null;
}

const ALAN_ETIKET_VARSAYILAN: Record<BankaAlan, string> = {
  tarih: "Tarih",
  valor: "Valör",
  aciklama: "Açıklama",
  tutar: "Tutar (tek sütun)",
  borc: "Borç (çıkış)",
  alacak: "Alacak (giriş)",
  bakiye: "Bakiye",
  karsiTaraf: "Karşı taraf",
  refNo: "Referans no",
  hesap: "Hesap / IBAN",
};

function tl(n: number): string {
  return n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function Sayi({ etiket, deger, birim, vurgu }: { etiket: string; deger: string; birim?: string; vurgu?: "danger" | "ok" | "warn" }) {
  const renk =
    vurgu === "danger" ? "text-[var(--danger)]" : vurgu === "ok" ? "text-[var(--ok)]" : vurgu === "warn" ? "text-[var(--warn)]" : "text-[var(--text-primary)]";
  return (
    <div className="rounded-md border border-[var(--border-default)] bg-[var(--surface-2)] p-3">
      <p className="text-[10px] font-medium uppercase tracking-widest text-[var(--text-muted)]">{etiket}</p>
      <p className={`mt-1 text-[18px] font-semibold tabular-nums ${renk}`}>
        {deger}
        {birim && <span className="ml-1 text-[11px] font-normal text-[var(--text-muted)]">{birim}</span>}
      </p>
    </div>
  );
}

/** Dosya adından banka tahmini — yalnız ÖN SEÇİM, son söz kullanıcıda. */
function bankaTahminEt(fileName: string, bankaAdlari: string[]): string | null {
  const n = fileName.toLowerCase();
  for (const ad of bankaAdlari) {
    const parcalar = ad.toLowerCase().split(/\s+/).filter((p) => p.length > 2);
    if (parcalar.some((p) => n.includes(p))) return ad;
  }
  return null;
}

export function BankaUpload({ bankalar }: { bankalar: { name: string; balanceTry: number | null }[] }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dosya, setDosya] = useState<File | null>(null);
  const [banka, setBanka] = useState<string>("");
  const [onizleme, setOnizleme] = useState<OnizlemeYaniti | null>(null);
  const [esleme, setEsleme] = useState<Partial<Record<BankaAlan, string>>>({});
  const [sonuc, setSonuc] = useState<Sonuc | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [mesgul, setMesgul] = useState<false | "onizle" | "yaz">(false);

  const bankaAdlari = useMemo(() => bankalar.map((b) => b.name), [bankalar]);

  function dosyaSecildi(f: File | null) {
    setDosya(f);
    setOnizleme(null);
    setSonuc(null);
    setHata(null);
    setEsleme({});
    if (f && !banka) {
      const tahmin = bankaTahminEt(f.name, bankaAdlari);
      if (tahmin) setBanka(tahmin);
    }
  }

  function bankaDegisti(v: string) {
    setBanka(v);
    setOnizleme(null);
    setSonuc(null);
    setHata(null);
  }

  async function onizle(mappingOverride?: Partial<Record<BankaAlan, string>>) {
    if (!dosya || !banka) return;
    setMesgul("onizle");
    setHata(null);
    try {
      const fd = new FormData();
      fd.append("file", dosya);
      fd.append("banka", banka);
      const kullanilacakMapping = mappingOverride ?? esleme;
      if (Object.keys(kullanilacakMapping).length > 0) {
        fd.append("mapping", JSON.stringify(kullanilacakMapping));
      }
      const res = await fetch("/api/admin/banka-yukleme/onizleme", { method: "POST", body: fd });
      const body = (await res.json().catch(() => null)) as OnizlemeYaniti & { error?: string };
      if (!res.ok) {
        setHata(body?.error ?? "Önizleme başarısız.");
        return;
      }
      setOnizleme(body);
      // Otomatik bulunanları taslağa aktar — eşleme gerekiyorsa kullanıcı
      // yalnız kalanları seçer, tamsa "Onayla ve yaz" bunu geri gönderir.
      setEsleme(body.eslesen ?? {});
    } catch (err) {
      console.error("[banka-upload]", err);
      setHata("Ağ hatası — işlem tamamlanamadı.");
    } finally {
      setMesgul(false);
    }
  }

  async function yazUygula() {
    if (!dosya || !banka || !onizleme || onizleme.needsMapping) return;
    setMesgul("yaz");
    setHata(null);
    try {
      const fd = new FormData();
      fd.append("file", dosya);
      fd.append("banka", banka);
      fd.append("mapping", JSON.stringify(esleme));
      fd.append("fileHash", onizleme.fileHash ?? "");
      fd.append("onayAnahtari", onizleme.onayAnahtari ?? "");
      const res = await fetch("/api/admin/banka-yukleme/uygula", { method: "POST", body: fd });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setHata(body?.error ?? "İşlem başarısız.");
        if (res.status === 409) setOnizleme(null);
        return;
      }
      setSonuc(body as Sonuc);
      setOnizleme(null);
      setDosya(null);
      setEsleme({});
      if (inputRef.current) inputRef.current.value = "";
    } catch (err) {
      console.error("[banka-upload]", err);
      setHata("Ağ hatası — işlem tamamlanamadı.");
    } finally {
      setMesgul(false);
    }
  }

  const o = onizleme?.needsMapping === false ? onizleme.onizleme : undefined;
  const elleEslemeGerek = onizleme?.needsMapping === true;

  return (
    <div className="space-y-5">
      <Card className="space-y-4 p-6">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Banka</p>
          <select
            value={banka}
            onChange={(e) => bankaDegisti(e.target.value)}
            className="mt-1 h-9 w-full max-w-sm rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] px-2 text-[13px] text-[var(--text-primary)]"
          >
            <option value="">— Banka seçin —</option>
            {bankalar.map((b) => (
              <option key={b.name} value={b.name}>
                {b.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Dosya adından tahmin edilir ama son söz sizde — yanlış banka seçilirse satırlar başka bankanın
            hareketleri olarak yazılır.
          </p>
        </div>

        <div>
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Dosya</p>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Banka hesap hareketleri dosyası (.xlsx, .xls veya .csv). PDF bu fazda desteklenmiyor.
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
          <Button onClick={() => void onizle()} disabled={!dosya || !banka || mesgul !== false}>
            {mesgul === "onizle" ? "Okunuyor..." : "Önizle"}
          </Button>
          <Button
            variant="danger"
            onClick={() => void yazUygula()}
            disabled={!o || mesgul !== false}
            title={o ? undefined : "Önce eksiksiz bir önizleme alın"}
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
            {sonuc.eklenen.toLocaleString("tr-TR")} eklendi · {sonuc.atlananMukerrer.toLocaleString("tr-TR")} zaten
            vardı · {sonuc.atlananGecersiz.toLocaleString("tr-TR")} okunamadı ·{" "}
            {(sonuc.sureMs / 1000).toFixed(1)} sn
            {sonuc.tarihBas && ` · ${sonuc.tarihBas} → ${sonuc.tarihSon}`}
          </p>
          {sonuc.bakiyeFarki != null && Math.abs(sonuc.bakiyeFarki) > 0.01 && (
            <p className="text-xs text-[var(--warn)]">
              Dosyanın son bakiyesi ({tl(sonuc.dosyaSonBakiye ?? 0)} ₺) ile defterdeki bakiye (
              {tl(sonuc.defterBakiye ?? 0)} ₺) arasında {tl(Math.abs(sonuc.bakiyeFarki))} ₺ fark var. Bakiye alanı
              bu ekrandan güncellenmedi — karar CFO&apos;nun.
            </p>
          )}
        </Card>
      )}

      {elleEslemeGerek && onizleme && (
        <Card className="space-y-4 p-6">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
              Sütun eşlemesi gerekiyor
            </p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Bu dosyadaki başlıklar otomatik tanınamadı ({(onizleme.eksikZorunlu ?? []).map((a) => (onizleme.alanEtiketleri ?? ALAN_ETIKET_VARSAYILAN)[a]).join(", ")} eksik).
              İlk {onizleme.ilkSatirlar?.length ?? 0} satıra bakıp her alan için doğru sütunu seçin.
            </p>
          </div>

          {onizleme.ilkSatirlar && onizleme.ilkSatirlar.length > 0 && (
            <div className="overflow-x-auto rounded-md border border-[var(--border-subtle)]">
              <table className="w-full text-xs">
                <thead className="bg-[var(--surface-1)]">
                  <tr>
                    {(onizleme.basliklar ?? []).map((b, i) => (
                      <th key={i} className="px-3 py-2 text-left font-medium text-[var(--text-muted)]">
                        {b || `(sütun ${i + 1})`}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {onizleme.ilkSatirlar.map((row, ri) => (
                    <tr key={ri} className="border-t border-[var(--border-subtle)]">
                      {row.map((c, ci) => (
                        <td key={ci} className="px-3 py-1.5 text-[var(--text-secondary)]">
                          {c}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
            {ALAN_SIRASI.map((alan) => (
              <div key={alan}>
                <label className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
                  {(onizleme.alanEtiketleri ?? ALAN_ETIKET_VARSAYILAN)[alan]}
                  {ZORUNLU_GOSTER.includes(alan) && <span className="text-[var(--danger)]"> *</span>}
                </label>
                <select
                  value={esleme[alan] ?? ""}
                  onChange={(e) => setEsleme((prev) => ({ ...prev, [alan]: e.target.value || undefined }))}
                  className="mt-1 h-9 w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] px-2 text-[12px] text-[var(--text-primary)]"
                >
                  <option value="">— seçilmedi —</option>
                  {(onizleme.basliklar ?? []).map((b, i) => (
                    <option key={i} value={b}>
                      {b || `(sütun ${i + 1})`}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <p className="text-xs text-[var(--text-muted)]">
            Ya <strong>Tutar (tek sütun)</strong> ya da <strong>Borç</strong> + <strong>Alacak</strong> ikisi
            birlikte seçilmeli.
          </p>

          <Button onClick={() => void onizle(esleme)} disabled={mesgul !== false}>
            {mesgul === "onizle" ? "Okunuyor..." : "Eşlemeyi uygula ve tekrar önizle"}
          </Button>
        </Card>
      )}

      {o && onizleme && (
        <Card className="space-y-5 p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Önizleme</p>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                <span className="font-medium">{o.banka}</span>
                {o.hesap && <span className="font-mono"> · {o.hesap}</span>}
                {o.dosyaTarihBas && (
                  <>
                    {" · "}
                    <span className="tabular-nums">
                      {o.dosyaTarihBas} → {o.dosyaTarihSon}
                    </span>
                  </>
                )}
              </p>
            </div>
            <Badge variant="info">Henüz hiçbir şey yazılmadı</Badge>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Sayi etiket="Toplam satır" deger={o.toplamSatir.toLocaleString("tr-TR")} />
            <Sayi etiket="Yeni" deger={o.yeni.toLocaleString("tr-TR")} vurgu="ok" />
            <Sayi etiket="Zaten var" deger={o.zatenVar.toLocaleString("tr-TR")} />
            <Sayi etiket="Okunamayan" deger={o.atlanan.toLocaleString("tr-TR")} vurgu={o.atlanan ? "warn" : undefined} />
            <Sayi etiket="Toplam giriş" deger={tl(o.toplamGiris)} birim="₺" vurgu="ok" />
            <Sayi etiket="Toplam çıkış" deger={tl(o.toplamCikis)} birim="₺" vurgu="danger" />
            <Sayi etiket="Net" deger={tl(o.net)} birim="₺" vurgu={o.net >= 0 ? "ok" : "danger"} />
          </div>

          <div className="rounded-md border border-[var(--border-default)] bg-[var(--surface-2)] p-4">
            <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
              Bakiye karşılaştırması (yalnız bilgi — otomatik düzeltme yok)
            </p>
            {o.dosyaSonBakiye == null ? (
              <p className="mt-1 text-sm text-[var(--text-muted)]">Dosyada bakiye sütunu bulunamadı.</p>
            ) : (
              <p className="mt-1 text-sm text-[var(--text-secondary)] tabular-nums">
                Dosyanın son satırı: <strong>{tl(o.dosyaSonBakiye)} ₺</strong> · Defterdeki (
                <code>cfo_bank_account</code>): {o.defterBakiye == null ? "bilinmiyor" : `${tl(o.defterBakiye)} ₺`}
                {o.bakiyeFarki != null && (
                  <span className={Math.abs(o.bakiyeFarki) > 0.01 ? "text-[var(--warn)]" : "text-[var(--ok)]"}>
                    {" · fark "}
                    {tl(o.bakiyeFarki)} ₺
                  </span>
                )}
              </p>
            )}
          </div>

          {o.tarihBoslugu && (
            <Card className="border-[var(--warn-border)] bg-[var(--warn-dim)] p-4">
              <p className="text-sm font-semibold text-[var(--warn)]">
                Tarih boşluğu: {o.tarihBoslugu.bas} – {o.tarihBoslugu.son} arası eksik olabilir
              </p>
              <p className="mt-1 text-xs text-[var(--warn)] opacity-90">
                Bu bankanın defterdeki en yeni hareketi ile bu dosyadaki en eski hareket arasında boşluk var.
              </p>
            </Card>
          )}

          {o.buyukHareketler.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
                Defterde karşılığı olmayan büyük hareketler (≥ 25.000 ₺, ilk {o.buyukHareketler.length})
              </p>
              <div className="overflow-x-auto rounded-md border border-[var(--border-subtle)]">
                <table className="w-full text-xs">
                  <thead className="bg-[var(--surface-1)]">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-[var(--text-muted)]">Tarih</th>
                      <th className="px-3 py-2 text-left font-medium text-[var(--text-muted)]">Açıklama</th>
                      <th className="px-3 py-2 text-left font-medium text-[var(--text-muted)]">Karşı taraf</th>
                      <th className="px-3 py-2 text-right font-medium text-[var(--text-muted)]">Tutar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {o.buyukHareketler.map((h, i) => (
                      <tr key={i} className="border-t border-[var(--border-subtle)]">
                        <td className="px-3 py-1.5 font-mono tabular-nums">{h.tarih}</td>
                        <td className="px-3 py-1.5 text-[var(--text-secondary)]">{h.aciklama.slice(0, 60)}</td>
                        <td className="px-3 py-1.5 text-[var(--text-secondary)]">{h.karsiTaraf ?? "—"}</td>
                        <td
                          className={`px-3 py-1.5 text-right tabular-nums font-medium ${
                            h.tutarTry >= 0 ? "text-[var(--ok)]" : "text-[var(--danger)]"
                          }`}
                        >
                          {tl(h.tutarTry)} ₺
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-[var(--text-muted)]">Bu liste CFO&apos;nun sınıflandırması içindir.</p>
            </div>
          )}

          {onizleme.eslesmeyenSutunlar && onizleme.eslesmeyenSutunlar.length > 0 && (
            <p className="text-xs text-[var(--text-muted)]">
              Dosyadaki eşleşmeyen sütunlar (yazılmaz): {onizleme.eslesmeyenSutunlar.join(", ")}
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
