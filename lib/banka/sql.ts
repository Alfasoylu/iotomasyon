/**
 * cfo_banka_hareket yazma SQL'i — SAF (prisma import ETMEZ).
 *
 * ⛔ SINIR: bu dosya yalnız INSERT üretir. UPDATE/DELETE burada YOK ve
 * eklenmeyecek — `cfo_banka_hareket` tablosuna uygulama yalnız INSERT eder
 * (görev şartı). Aynı satır tekrar yüklenirse `satir_hash` çakışır ve
 * `ON CONFLICT DO NOTHING` sessizce atlar.
 *
 * Şema CFO tarafından Supabase'de zaten açıldı — burada migration YOK,
 * `prisma db push` YOK. Tablo Prisma modeli olarak TANIMLANMADI (bilerek):
 * şemaya prisma migrate ile dokunma riskini tamamen ortadan kaldırır.
 */
import type { BankaKayit } from "./import";

export interface Col {
  ad: string;
  tip: string;
  al: (r: BankaKayit) => unknown;
}

export const INSERT_COLS: Col[] = [
  { ad: "banka", tip: "text", al: (r) => r.banka },
  { ad: "hesap", tip: "text", al: (r) => r.hesap },
  { ad: "tarih", tip: "date", al: (r) => r.tarihIso },
  { ad: "valor", tip: "date", al: (r) => r.valorIso },
  { ad: "aciklama", tip: "text", al: (r) => r.aciklama },
  { ad: "tutar_try", tip: "numeric", al: (r) => r.tutarTry },
  { ad: "bakiye_try", tip: "numeric", al: (r) => r.bakiyeTry },
  { ad: "karsi_taraf", tip: "text", al: (r) => r.karsiTaraf },
  { ad: "ref_no", tip: "text", al: (r) => r.refNo },
  { ad: "kaynak_dosya", tip: "text", al: (r) => r.kaynakDosya },
  { ad: "import_id", tip: "bigint", al: (r) => r.importId },
  { ad: "satir_hash", tip: "text", al: (r) => r.satirHash },
];

function unnestArgs(cols: Col[], baslangic: number): string {
  return cols.map((c, i) => `$${baslangic + i}::${c.tip}[]`).join(", ");
}

function kolonListesi(cols: Col[]): string {
  return cols.map((c) => c.ad).join(", ");
}

export function insertSql(): string {
  return `INSERT INTO cfo_banka_hareket (${kolonListesi(INSERT_COLS)})
    SELECT * FROM unnest(${unnestArgs(INSERT_COLS, 1)})
    ON CONFLICT (satir_hash) DO NOTHING`;
}

