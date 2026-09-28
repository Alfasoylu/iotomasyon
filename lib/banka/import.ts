/**
 * Banka hareketleri yüklemesi — kayıt üretimi, önizleme farkı ve yazma.
 *
 * ⛔ SINIRLAR (görev şartı):
 *   • `cfo_banka_hareket`'e yalnız INSERT edilir; UPDATE/DELETE yok.
 *   • `cfo_bank_account.balanceTry` uygulama tarafından GÜNCELLENMEZ — yalnız
 *     karşılaştırma için OKUNUR.
 *   • Onay olmadan tek satır yazılmaz: önizleme ve yazma ayrı uçlar, aynı
 *     desen Entegra yüklemesiyle (`lib/entegra/import.ts`).
 */
import { prisma } from "@/lib/prisma";
import { numOrNull } from "@/lib/cfo/engine";
import type { BankaAlan } from "./columns";
import { hazirlaBankaDosyasi, satirHash, type BankaSatir, type AtlananSatir } from "./parse";
import { insertSql, INSERT_COLS } from "./sql";

export const BUYUK_HAREKET_ESIGI_TRY = 25000;

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
  importId: string; // bigint parametre olarak metin geçilir, pg cast eder — yalnız yazma anında bilinir
  satirHash: string;
  dosyaSatiri: number;
}

/** Log satırı henüz açılmadan önceki hâl — `importId` yazma anında eklenir. */
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
  kaynakDosya: string
): HazirBankaKaydi[] {
  const gunSayaci = new Map<string, number>();
  return satirlar.map((s) => {
    const tarihIso = isoGun(s.tarih);
    const sira = gunSayaci.get(tarihIso) ?? 0;
    gunSayaci.set(tarihIso, sira + 1);
    return {
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
      satirHash: satirHash(banka, tarihIso, Math.round(s.tutarTry * 100) / 100, s.aciklama, s.refNo, sira),
      dosyaSatiri: s.dosyaSatiri,
    };
  });
}

/* ────────────────────────────────── önizleme ────────────────────────────── */

export interface BuyukHareket {
  tarih: string;
  aciklama: string;
  tutarTry: number;
  karsiTaraf: string | null;
}

export interface TarihBosluguUyarisi {
  bas: string;
  son: string;
}

export interface BankaOnizleme {
  banka: string;
  hesap: string | null;
  toplamSatir: number;
  yeni: number;
  zatenVar: number;
  toplamGiris: number;
  toplamCikis: number; // pozitif gösterilir
  net: number;
  dosyaTarihBas: string | null;
  dosyaTarihSon: string | null;
  dosyaSonBakiye: number | null;
  defterBakiye: number | null;
  bakiyeFarki: number | null;
  buyukHareketler: BuyukHareket[];
  tarihBoslugu: TarihBosluguUyarisi | null;
  atlanan: number;
}

async function varOlanHashler(hashler: string[]): Promise<Set<string>> {
  const bulunan = new Set<string>();
  for (let i = 0; i < hashler.length; i += 1000) {
    const parca = hashler.slice(i, i + 1000);
    const rows = await prisma.$queryRawUnsafe<{ satir_hash: string }[]>(
      `SELECT satir_hash FROM cfo_banka_hareket WHERE satir_hash = ANY($1::text[])`,
      parca
    );
    for (const r of rows) bulunan.add(r.satir_hash);
  }
  return bulunan;
}

export async function buildOnizleme(
  kayitlar: HazirBankaKaydi[],
  banka: string,
  atlanan: number
): Promise<BankaOnizleme> {
  const hashler = kayitlar.map((k) => k.satirHash);
  const varOlan = await varOlanHashler(hashler);
  const yeniKayitlar = kayitlar.filter((k) => !varOlan.has(k.satirHash));

  let toplamGiris = 0;
  let toplamCikis = 0;
  for (const k of kayitlar) {
    if (k.tutarTry >= 0) toplamGiris += k.tutarTry;
    else toplamCikis += -k.tutarTry;
  }

  // Dosyanın SON satırı — dosya sırasına göre (tarihe göre DEĞİL, bazı
  // ekstreler en yeniyi başa yazar). İlk bulunan geriye doğru taranır.
  let dosyaSonBakiye: number | null = null;
  for (let i = kayitlar.length - 1; i >= 0; i--) {
    if (kayitlar[i].bakiyeTry != null) {
      dosyaSonBakiye = kayitlar[i].bakiyeTry;
      break;
    }
  }

  const hesap = kayitlar.find((k) => k.hesap)?.hesap ?? null;

  const banka_ = await prisma.cfoBankAccount.findFirst({ where: { name: banka } });
  const defterBakiye = numOrNull(banka_?.balanceTry ?? null);
  const bakiyeFarki =
    dosyaSonBakiye != null && defterBakiye != null
      ? Math.round((dosyaSonBakiye - defterBakiye) * 100) / 100
      : null;

  const buyukHareketler: BuyukHareket[] = yeniKayitlar
    .filter((k) => Math.abs(k.tutarTry) >= BUYUK_HAREKET_ESIGI_TRY)
    .sort((a, b) => (a.tarihIso < b.tarihIso ? 1 : a.tarihIso > b.tarihIso ? -1 : 0))
    .slice(0, 20)
    .map((k) => ({ tarih: k.tarihIso, aciklama: k.aciklama, tutarTry: k.tutarTry, karsiTaraf: k.karsiTaraf }));

  const tarihler = kayitlar.map((k) => k.tarihIso).sort();
  const dosyaTarihBas = tarihler[0] ?? null;
  const dosyaTarihSon = tarihler[tarihler.length - 1] ?? null;

  const tarihBoslugu = await bosluguBul(banka, dosyaTarihBas);

  return {
    banka,
    hesap,
    toplamSatir: kayitlar.length,
    yeni: yeniKayitlar.length,
    zatenVar: kayitlar.length - yeniKayitlar.length,
    toplamGiris: Math.round(toplamGiris * 100) / 100,
    toplamCikis: Math.round(toplamCikis * 100) / 100,
    net: Math.round((toplamGiris - toplamCikis) * 100) / 100,
    dosyaTarihBas,
    dosyaTarihSon,
    dosyaSonBakiye,
    defterBakiye,
    bakiyeFarki,
    buyukHareketler,
    tarihBoslugu,
    atlanan,
  };
}

async function bosluguBul(banka: string, dosyaEnEski: string | null): Promise<TarihBosluguUyarisi | null> {
  if (!dosyaEnEski) return null;
  const rows = await prisma.$queryRawUnsafe<{ son: string | null }[]>(
    `SELECT to_char(max(tarih), 'YYYY-MM-DD') AS son FROM cfo_banka_hareket WHERE banka = $1::text`,
    banka
  );
  const dbSon = rows[0]?.son ?? null;
  if (!dbSon) return null;

  const gun = (iso: string, delta: number) => {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + delta);
    return d.toISOString().slice(0, 10);
  };

  const bas = gun(dbSon, 1);
  const son = gun(dosyaEnEski, -1);
  if (bas > son) return null; // boşluk yok / bitişik

  return { bas, son };
}

/* ──────────────────────────────────── yazma ─────────────────────────────── */

export interface YazmaSonucu {
  eklenen: number;
  atlananMukerrer: number;
  logId: string;
  sureMs: number;
}

const PARCA = 500;

export interface YazBaglam {
  banka: string;
  fileName: string;
  userId: string | null;
  userEmail: string | null;
  onizleme: BankaOnizleme;
  atlananSayisi: number;
}

/**
 * Onaylanmış yüklemeyi TEK TRANSACTION'da yazar: önce log satırı (id almak
 * için), sonra 500'lük gruplarla INSERT, sonunda log'un gerçek sayılarla
 * güncellenmesi. Herhangi bir adım patlarsa hiçbiri kalıcı olmaz.
 */
export async function yaz(kayitlarBase: HazirBankaKaydi[], ctx: YazBaglam): Promise<YazmaSonucu> {
  const t0 = Date.now();
  const sql = insertSql();

  return prisma.$transaction(async (tx) => {
    const log = await tx.bankaImportLog.create({
      data: {
        fileName: ctx.fileName,
        banka: ctx.banka,
        rowCount: kayitlarBase.length,
        addedCount: 0,
        skippedCount: ctx.atlananSayisi,
        dateFrom: ctx.onizleme.dosyaTarihBas ? new Date(`${ctx.onizleme.dosyaTarihBas}T00:00:00Z`) : null,
        dateTo: ctx.onizleme.dosyaTarihSon ? new Date(`${ctx.onizleme.dosyaTarihSon}T00:00:00Z`) : null,
        fileBalanceTry: ctx.onizleme.dosyaSonBakiye,
        userId: ctx.userId,
        userEmail: ctx.userEmail,
      },
    });

    const kayitlar: BankaKayit[] = kayitlarBase.map((k) => ({ ...k, importId: log.id.toString() }));

    let eklenen = 0;
    for (let i = 0; i < kayitlar.length; i += PARCA) {
      const parca = kayitlar.slice(i, i + PARCA);
      const n = await tx.$executeRawUnsafe(sql, ...INSERT_COLS.map((c) => parca.map(c.al)));
      eklenen += n;
    }

    const atlananMukerrer = kayitlar.length - eklenen;

    await tx.bankaImportLog.update({
      where: { id: log.id },
      data: { addedCount: eklenen, skippedCount: ctx.atlananSayisi + atlananMukerrer },
    });

    return { eklenen, atlananMukerrer, logId: log.id.toString(), sureMs: Date.now() - t0 };
  }, { timeout: 60_000, maxWait: 10_000 });
}

/* ─────────────────────────────── ortak hazırlık ─────────────────────────── */

export interface Hazirlik {
  satirlar: BankaSatir[];
  atlanan: AtlananSatir[];
  eksikZorunlu: BankaAlan[];
  eslesen: Partial<Record<BankaAlan, string>>;
  eslesmeyenSutunlar: string[];
  basliklar: string[];
  ilkSatirlar: string[][];
}

export function hazirla(buffer: Buffer, elleEsleme?: Partial<Record<BankaAlan, string>>): Hazirlik {
  const r = hazirlaBankaDosyasi(buffer, elleEsleme);
  return {
    satirlar: r.satirlar,
    atlanan: r.atlanan,
    eksikZorunlu: r.eslesme.eksikZorunlu,
    eslesen: r.eslesme.eslesen,
    eslesmeyenSutunlar: r.eslesme.eslesmeyenSutunlar,
    basliklar: r.basliklar,
    ilkSatirlar: r.ilkSatirlar,
  };
}

/** Dosya adından banka tahmini — yalnız ÖN SEÇİM, son söz kullanıcıda. */
export function bankaTahminEt(fileName: string, bankaAdlari: string[]): string | null {
  const n = fileName.toLowerCase();
  for (const ad of bankaAdlari) {
    const parcalar = ad.toLowerCase().split(/\s+/).filter((p) => p.length > 2);
    if (parcalar.some((p) => n.includes(p))) return ad;
  }
  return null;
}
