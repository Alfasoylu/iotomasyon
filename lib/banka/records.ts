import { createHash } from "node:crypto";
import { satirHash, type BankaSatir } from "./parse";

export interface BankaKayit {
  banka: string;
  hesap: string | null;
  tarihIso: string; // yyyy-mm-dd
  valorIso: string | null;
  aciklama: string;
  tutarTry: number;
  bakiyeTry: number | null;
  karsiTaraf: string | null;
  refNo: string | null;
  kaynakDosya: string;
  importId: string | null; // Yeni import-log tablosu gerektirmemek için boş bırakılır.
  satirHash: string;
  dosyaSatiri: number;
  legacyHash?: string;
}

/** Dosyadan hazırlanan kayıt; import_id mevcut şemada nullable olmalıdır. */
export type HazirBankaKaydi = Omit<BankaKayit, "importId">;

function isoGun(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Ayrıştırılmış satırları yazmaya hazır kayıtlara çevirir.
 *
 * `siraAyniGun` DOSYA SIRASINA göre atanır (aynı gün içinde kaçıncı satır).
 * Aynı gün/tutar/açıklamalı iki GERÇEK işlem olabileceği için hash'e girer —
 * yoksa ikinci gerçek işlem "zaten var" sayılıp sessizce atlanırdı.
 */
export function kayitlaraDonustur(
  satirlar: BankaSatir[],
  banka: string,
  kaynakDosya: string,
  legacySatirlar?: BankaSatir[]
): HazirBankaKaydi[] {
  const legacy = new Map(kayitlaraDonusturLegacy(legacySatirlar ?? [], banka, kaynakDosya).map(row => [row.dosyaSatiri, row]));
  const gunSayaci = new Map<string, number>();
  return satirlar.map((s) => {
    const tarihIso = isoGun(s.tarih);
    const sira = gunSayaci.get(tarihIso) ?? 0;
    gunSayaci.set(tarihIso, sira + 1);
    return {
      legacyHash: (() => {
        const old = legacy.get(s.dosyaSatiri);
        return old && old.tarihIso === tarihIso && old.tutarTry === Math.round(s.tutarTry * 100) / 100
          && old.bakiyeTry === (s.bakiyeTry == null ? null : Math.round(s.bakiyeTry * 100) / 100) ? old.satirHash : undefined;
      })(),
      banka,
      hesap: s.hesap,
      tarihIso,
      valorIso: s.valor ? isoGun(s.valor) : null,
      aciklama: s.aciklama,
      tutarTry: Math.round(s.tutarTry * 100) / 100,
      bakiyeTry: s.bakiyeTry == null ? null : Math.round(s.bakiyeTry * 100) / 100,
      karsiTaraf: s.karsiTaraf,
      refNo: s.refNo,
      kaynakDosya,
      satirHash: legacySatirlar === undefined
        ? satirHash(banka, tarihIso, Math.round(s.tutarTry * 100) / 100, s.aciklama, s.refNo, sira)
        : createHash("md5").update(`pdf-table-v2|${satirHash(banka, tarihIso, Math.round(s.tutarTry * 100) / 100, s.aciklama, s.refNo, s.dosyaSatiri)}`).digest("hex"),
      dosyaSatiri: s.dosyaSatiri,
    };
  });
}

function kayitlaraDonusturLegacy(rows: BankaSatir[], bank: string, file: string): HazirBankaKaydi[] {
  return rows.length ? kayitlaraDonustur(rows, bank, file) : [];
}

export function filterAlreadyStored<T extends { satirHash: string; legacyHash?: string }>(rows: T[], existing: Set<string>): T[] {
  return rows.filter(row => !existing.has(row.satirHash) && !(row.legacyHash && existing.has(row.legacyHash)));
}
