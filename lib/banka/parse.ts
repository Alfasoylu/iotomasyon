/**
 * Banka ekstresi dosyasını (.xlsx/.xls/.csv) satır kayıtlarına çevirir.
 *
 * Bu dosya SAF: veritabanına dokunmaz, yalnız ayrıştırır. Eşleştirme (banka
 * seçimi, hash, mevcut kayıt karşılaştırması) `lib/banka/import.ts` içinde.
 *
 * ⚠️ Başlık satırı dosyanın İLK satırı VARSAYILMAZ (Enpara'da değil) — ilk
 * `BASLIK_TARAMA_SATIRI` satır içinde en çok sütun adayıyla eşleşen satır
 * başlık kabul edilir.
 */
import * as XLSX from "xlsx";
import { createHash } from "node:crypto";
import { metinHazirla } from "@/lib/entegra/parse";
import {
  type BankaAlan,
  ALAN_ADAYLARI,
  normalizeHeader,
  otomatikEsle,
  zorunluEksik,
  type SutunEslemesi,
} from "./columns";

const BASLIK_TARAMA_SATIRI = 25;
const TUM_ADAY_NORM = new Set(
  Object.values(ALAN_ADAYLARI).flat().map(normalizeHeader)
);

export interface BankaSatir {
  tarih: Date; // gün, saatsiz (UTC gece yarısı)
  valor: Date | null;
  aciklama: string;
  tutarTry: number; // giriş +, çıkış −
  bakiyeTry: number | null;
  karsiTaraf: string | null;
  refNo: string | null;
  hesap: string | null;
  dosyaSatiri: number; // 1 tabanlı, başlıktan sonraki sıraya göre (teşhis için)
}

export interface AtlananSatir {
  satir: number;
  sebep: string;
}

export interface HamAyristirma {
  metadata?: string[];
  basliklar: string[];
  ilkSatirlar: string[][]; // önizleme/elle eşleme için ham ilk 5 veri satırı
  basliklarSatiriIndex: number;
  tumSatirlar: string[][]; // başlıktan SONRAKİ tüm ham satırlar
}

/** Dosyayı okuyup başlık satırını bulur. Veritabanına dokunmaz. */
export function ayristirHam(buffer: Buffer): HamAyristirma {
  const { buf, codepage } = metinHazirla(buffer);
  const wb = XLSX.read(buf, { type: "buffer", codepage, cellDates: false });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("Dosyada sayfa bulunamadı.");

  const satirlar = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], {
    header: 1,
    defval: "",
    raw: true,
    blankrows: false,
  });
  if (satirlar.length > 20000) throw new Error("Dosya en fazla 20.000 satır olabilir.");
  if (satirlar.length === 0) throw new Error("Dosya boş.");

  let enIyiIndex = 0;
  let enIyiSkor = -1;
  const taramaSiniri = Math.min(satirlar.length, BASLIK_TARAMA_SATIRI);
  for (let i = 0; i < taramaSiniri; i++) {
    const skor = (satirlar[i] as unknown[]).filter(
      (h) => typeof h === "string" && TUM_ADAY_NORM.has(normalizeHeader(h))
    ).length;
    if (skor > enIyiSkor) {
      enIyiSkor = skor;
      enIyiIndex = i;
    }
  }
  // Hiçbir satırda tek eşleşme yoksa (skor 0), yine de ilk satırı başlık say —
  // elle eşleme ekranı devreye girer, hatasız çökmek yerine kullanıcıya sorulur.

  const basliklar = (satirlar[enIyiIndex] as unknown[]).map((h) => String(h ?? "").trim());
  const names = basliklar.filter(Boolean).map(normalizeHeader);
  if (new Set(names).size !== names.length) throw new Error("Dosyada aynı sütun başlığı birden fazla var. Başlıkları tekilleştirip yeniden yükleyin.");
  const veriSatirlari = satirlar.slice(enIyiIndex + 1).map((r) => (r as unknown[]).map((c) => String(c ?? "")));

  return {
    metadata: satirlar.slice(0, enIyiIndex).map(row => row.join(" ")),
    basliklar,
    ilkSatirlar: veriSatirlari.slice(0, 5),
    basliklarSatiriIndex: enIyiIndex,
    tumSatirlar: veriSatirlari,
  };
}

/**
 * Tarihi SAATSİZ UTC gece yarısına sabitler.
 * Kabul edilen: Date · Excel seri numarası · "dd/MM/yyyy" · "dd.MM.yyyy" · ISO.
 * ⚠️ GÜN ÖNCE gelir (Türk biçimi) — Entegra ayrıştırıcısının varsaydığı
 * "M/d/yy" (Amerikan) biçimi burada KULLANILMAZ, banka ekstresi Türk
 * biçiminde ("28/09/2026") gelir; aynı regex'i kopyalamak tarihleri ay/gün
 * karıştırırdı.
 */
export function toDateOnlyTr(raw: unknown): Date | null {
  if (raw == null || raw === "") return null;

  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return new Date(Date.UTC(raw.getUTCFullYear(), raw.getUTCMonth(), raw.getUTCDate()));
  }

  if (typeof raw === "number" && Number.isFinite(raw)) {
    const ms = Math.round((raw - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return null;
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }

  const s = String(raw).trim();
  if (!s) return null;

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return ymd(+iso[1], +iso[2], +iso[3]);

  // dd/MM/yyyy veya dd.MM.yyyy — gün ÖNCE.
  const dmy = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (dmy) return ymd(yr(dmy[3]), +dmy[2], +dmy[1]);

  // Excel'in metne çevirdiği seri numarası ("45932" gibi salt rakam).
  if (/^\d{4,6}(?:\.\d+)?$/.test(s)) {
    const n = Number(s);
    const ms = Math.round((n - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) {
      return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    }
  }

  return null;
}

function yr(v: string): number {
  const n = parseInt(v, 10);
  return v.length === 2 ? 2000 + n : n;
}

function ymd(y: number, mo: number, d: number): Date | null {
  if (!Number.isFinite(y) || y < 2000 || y > 2100) return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? dt : null;
}

/** "1.234,56" / "1234.56" / "1.234,56-" / 1234.56 → 1234.56 · boş → null */
export function toDecimalTr(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  let s = String(raw).trim();
  if (!s) return null;

  // Bazı ekstrelerde tutarın sonuna "-" veya "DR"/"CR" eklenir.
  let negatif = false;
  if (/-\s*$/.test(s)) {
    negatif = true;
    s = s.replace(/-\s*$/, "");
  }
  s = s.replace(/\s*(TRY|TL|₺)\s*/gi, "").trim().replace(/^([+-])\s+(?=\d)/, "$1");
  if (!s) return null;

  // Reject partial parses and ambiguous thousands separators.
  if (/^[+-]?\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s)) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/^[+-]?\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(s)) {
    s = s.replace(/,/g, "");
  } else if (/^[+-]?\d+(,\d{1,2})?$/.test(s)) {
    s = s.replace(",", ".");
  } else if (!/^[+-]?\d+(\.\d{1,2})?$/.test(s)) {
    return null;
  }
  const n = Number(s);
  if (!Number.isFinite(n) || Math.abs(n) >= 1e12) return null;
  return negatif ? -Math.abs(n) : n;
}

/** Açıklama normalize — yalnız hash'te kullanılır, gösterimde ham metin kalır. */
export function normalizeAciklama(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLocaleUpperCase("tr-TR");
}

export function satirHash(
  banka: string,
  tarihIso: string, // yyyy-mm-dd
  tutarTry: number,
  aciklama: string,
  refNo: string | null,
  siraAyniGun: number
): string {
  const parca = [
    banka,
    tarihIso,
    tutarTry.toFixed(2),
    normalizeAciklama(aciklama),
    refNo ?? "",
    String(siraAyniGun),
  ].join("|");
  return createHash("md5").update(parca).digest("hex");
}

export function fileHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * Önizleme → yaz onayının anahtarı. Yalnız dosya değişmiş mi (fileHash) değil,
 * BANKA seçimi ve sütun eşlemesi önizlemeden sonra değişmiş mi de burada
 * doğrulanır — ikisi de satır hash'ini etkiler (`banka` formülün parçası,
 * eşleme hangi sütunun tutar/tarih sayıldığını belirler). Kullanıcı önizleme
 * sonrası bankayı değiştirip "onayla"ya basarsa, gördüğü sayılarla yazılacak
 * satırlar aynı olmazdı.
 */
export function onayAnahtariHesapla(
  gercekFileHash: string,
  banka: string,
  eslesen: Partial<Record<BankaAlan, string>>
): string {
  const eslemeMetni = Object.keys(eslesen)
    .sort()
    .map((k) => `${k}=${eslesen[k as BankaAlan]}`)
    .join("&");
  return createHash("sha256").update(`bank-parser-v2|${gercekFileHash}|${banka}|${eslemeMetni}`).digest("hex");
}

export interface AyristirmaSonucu {
  legacySatirlar?: BankaSatir[];
  eslesme: SutunEslemesi;
  satirlar: BankaSatir[];
  atlanan: AtlananSatir[];
  basliklar: string[];
  ilkSatirlar: string[][];
}

/**
 * Ayrıştırılmış başlık + veri satırlarını `eslesme`ye göre kayıtlara çevirir.
 * `eslesme` otomatik ya da kullanıcının elle seçtiği eşleme olabilir — ikisi
 * de aynı yoldan geçer, davranış ayrışmaz.
 */
export function satirlaraCevir(ham: HamAyristirma, eslesme: Partial<Record<BankaAlan, string>>): {
  satirlar: BankaSatir[];
  atlanan: AtlananSatir[];
} {
  // Eşleme BAŞLIK METNİYLE tutulur (kolon indeksiyle değil) — sunucu/istemci
  // arasında JSON'a sığdığı ve elle eşleme ekranında okunabilir kaldığı için.
  // ⚠️ Bilinen sınır: aynı başlık iki kez geçen bir dosyada `indexOf` her
  // zaman İLKİNİ döner. Gerçek banka ekstrelerinde mükerrer başlık görülmedi;
  // görülürse çözüm kolon indeksine geçmek.
  const index: Partial<Record<BankaAlan, number>> = {};
  for (const alan of Object.keys(eslesme) as BankaAlan[]) {
    const baslik = eslesme[alan];
    if (!baslik) continue;
    const i = ham.basliklar.indexOf(baslik);
    if (i >= 0) index[alan] = i;
  }

  const al = (row: string[], alan: BankaAlan): string => {
    const i = index[alan];
    return i == null ? "" : (row[i] ?? "").trim();
  };

  const satirlar: BankaSatir[] = [];
  const atlanan: AtlananSatir[] = [];

  ham.tumSatirlar.forEach((row, i) => {
    const dosyaSatiri = i + 1;
    const bosMu = row.every((c) => !c || !c.trim());
    if (bosMu) return;

    const atla = (sebep: string) => atlanan.push({ satir: dosyaSatiri, sebep });

    const tarih = toDateOnlyTr(al(row, "tarih"));
    if (!tarih) return atla(`Tarih okunamadı: "${al(row, "tarih")}"`);

    const aciklama = al(row, "aciklama");
    if (!aciklama) return atla("Açıklama boş");

    let tutarTry: number | null = null;
    if (index.tutar != null) {
      tutarTry = toDecimalTr(al(row, "tutar"));
    } else if (index.borc != null && index.alacak != null) {
      const borc = toDecimalTr(al(row, "borc"));
      const alacak = toDecimalTr(al(row, "alacak"));
      if (borc != null && borc !== 0) tutarTry = -Math.abs(borc);
      else if (alacak != null && alacak !== 0) tutarTry = Math.abs(alacak);
    }
    if (tutarTry == null) return atla("Tutar okunamadı veya boş");

    const valor = index.valor != null ? toDateOnlyTr(al(row, "valor")) : null;
    const bakiyeTry = index.bakiye != null ? toDecimalTr(al(row, "bakiye")) : null;
    const karsiTaraf = index.karsiTaraf != null ? al(row, "karsiTaraf") || null : null;
    const refNo = index.refNo != null ? al(row, "refNo") || null : null;
    const hesap = index.hesap != null ? al(row, "hesap") || null : null;

    satirlar.push({ tarih, valor, aciklama, tutarTry, bakiyeTry, karsiTaraf, refNo, hesap, dosyaSatiri });
  });

  return { satirlar, atlanan };
}

/** Dosyayı okur, başlığı bulur ve (verilmişse elle, yoksa otomatik) sütunları eşler. */
export function hazirlaBankaDosyasi(
  buffer: Buffer,
  elleEsleme?: Partial<Record<BankaAlan, string>>
): AyristirmaSonucu {
  return hazirlaBankaTablosu(ayristirHam(buffer), elleEsleme);
}

export function hazirlaBankaTablosu(ham: HamAyristirma, elleEsleme?: Partial<Record<BankaAlan, string>>): AyristirmaSonucu {
  const eslesen = elleEsleme ?? otomatikEsle(ham.basliklar).eslesen;
  const eksikZorunlu = zorunluEksik(eslesen);
  const eslesmeyenSutunlar = ham.basliklar.filter(
    (b) => b.trim() && !Object.values(eslesen).includes(b)
  );

  if (eksikZorunlu.length > 0) {
    return {
      eslesme: { eslesen, eslesmeyenSutunlar, eksikZorunlu },
      satirlar: [],
      atlanan: [],
      basliklar: ham.basliklar,
      ilkSatirlar: ham.ilkSatirlar,
    };
  }

  const { satirlar, atlanan } = satirlaraCevir(ham, eslesen);
  return {
    eslesme: { eslesen, eslesmeyenSutunlar, eksikZorunlu },
    satirlar,
    atlanan,
    basliklar: ham.basliklar,
    ilkSatirlar: ham.ilkSatirlar,
  };
}

