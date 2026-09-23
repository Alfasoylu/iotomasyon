/**
 * Entegra satış yüklemesi — ürün eşleştirme, önizleme farkı ve yazma.
 *
 * ⛔ SINIRLAR (kullanıcı şartı):
 *   • Yalnız MarketplaceSalesRecord yazılır (+ EntegraImportLog).
 *   • cfo_* tablolarına YAZILMAZ; cfo_norm() yalnız SALT OKUNUR çağrılır.
 *   • Onay olmadan tek satır yazılmaz: önizleme ve yazma ayrı uçlar.
 */
import { prisma } from "@/lib/prisma";
import { parseEntegraFile, type EntegraRecord } from "./parse";
import { INSERT_COLS, UPDATE_COLS, insertSql, updateSql } from "./sql";

/* ────────────────────────────── ürün eşleştirme ─────────────────────────── */

/**
 * Model kodundan productId türetir.
 *
 * Sıra ÖNEMLİ:
 *   1) lower(Product.sku) = lower(Model)   — birebir
 *   2) cfo_norm(sku) = cfo_norm(Model)     — yalnız 1'de bulunamayanlar için
 *
 * 🔴 Birebir ÖNCE gelmek zorunda: cfo_norm alfanümerik dışını siliyor, yani
 * ANUNNAKI-POINTER ile ANUNNAKIPOINTER aynı değere çöküyor. Norm önce
 * çalışsaydı iki ayrı ürünün satışı tek ürüne yazılırdı.
 *
 * Bir model birden fazla ürüne çözülüyorsa eşleştirme YAPILMAZ (null) —
 * rastgele seçim satışı yanlış ürüne yazar (22.09.2026 ölçümü: katalogda
 * cfo_norm altında çakışan 1 SKU çifti var).
 */
export async function matchProductIds(models: string[]): Promise<Map<string, string>> {
  const sonuc = new Map<string, string>();
  const benzersiz = [...new Set(models.map((m) => m.trim()).filter(Boolean))];
  if (benzersiz.length === 0) return sonuc;

  // 1) Birebir (küçük/büyük harf duyarsız)
  const birebir = await prisma.$queryRawUnsafe<{ model: string; pid: string; n: number }[]>(
    `SELECT m.model AS model, min(p.id) AS pid, count(*)::int AS n
       FROM unnest($1::text[]) AS m(model)
       JOIN "Product" p ON lower(p.sku) = lower(m.model)
      GROUP BY m.model`,
    benzersiz
  );
  for (const r of birebir) if (r.n === 1) sonuc.set(r.model, r.pid);

  // 2) cfo_norm — yalnız kalanlar. Boş norm hariç: cfo_norm('') = '' olduğu
  //    için filtresiz bırakılsa anlamsız kodlar rastgele ürünlere yapışırdı.
  const kalan = benzersiz.filter((m) => !sonuc.has(m));
  if (kalan.length > 0) {
    const norm = await prisma.$queryRawUnsafe<{ model: string; pid: string; n: number }[]>(
      `SELECT m.model AS model, min(p.id) AS pid, count(*)::int AS n
         FROM unnest($1::text[]) AS m(model)
         JOIN "Product" p ON cfo_norm(p.sku) = cfo_norm(m.model)
        WHERE cfo_norm(m.model) <> ''
        GROUP BY m.model`,
      kalan
    );
    for (const r of norm) if (r.n === 1) sonuc.set(r.model, r.pid);
  }

  return sonuc;
}

/** Kayıtlara productId yazar (Model boşsa null kalır). */
export async function eslestir(kayitlar: EntegraRecord[]): Promise<void> {
  const harita = await matchProductIds(
    kayitlar.map((k) => k.modelNumber ?? "").filter(Boolean)
  );
  for (const k of kayitlar) {
    k.productId = k.modelNumber ? harita.get(k.modelNumber.trim()) ?? null : null;
  }
}

/* ────────────────────────────────── önizleme ────────────────────────────── */

interface MevcutSatir {
  channel: string;
  orderNumber: string;
  externalLineId: string;
  status: string | null;
  quantity: number;
  total: number | null;
}

export interface DurumDegisimi {
  sku: string | null;
  orderNumber: string;
  eski: string;
  yeni: string;
  iadeyeDondu: boolean;
}

export interface Onizleme {
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

/**
 * Bir durumun iade/iptal olup olmadığı (Entegra metni serbest yazım).
 *
 * 🔴 TÜRKÇE 'i' TUZAĞI — 23.09.2026'da gerçek dosyada yakalandı.
 * `/iade|iptal/i.test("İade-İptal")` **false** döner: Türkçe büyük İ (U+0130)
 * JS regex'inin basit harf katlamasında ASCII 'i'ye katlanmaz. Entegra durumu
 * tam olarak "İade-İptal" yazdığı için "iadeye dönecek" sayacı HER gerçek
 * iadede 0 gösterirdi — yani ekranın en kritik uyarısı sessizce çalışmazdı.
 *
 * Yalnız `toLocaleLowerCase("tr")` de yetmez: tr yerelinde ASCII 'I' harfi
 * NOKTASIZ 'ı'ya iner, bu kez "IPTAL" yazımı kaçardı. Bu yüzden önce birleşen
 * noktalar ayrıştırılıp atılıyor, sonra noktasız ı da i'ye çekiliyor.
 */
function iadeMi(s: string): boolean {
  const n = s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\u0131/g, "i");
  return n.includes("iade") || n.includes("iptal");
}

export async function buildOnizleme(
  kayitlar: EntegraRecord[],
  atlanan: number,
  dosyaIciMukerrer: number
): Promise<Onizleme> {
  const mevcut = await mevcutSatirlar(kayitlar);
  const anahtar = (c: string, o: string, e: string) => `${c}|${o}|${e}`;
  const mevcutMap = new Map(
    mevcut.map((m) => [anahtar(m.channel, m.orderNumber, m.externalLineId), m])
  );

  let yeni = 0;
  let guncellenecek = 0;
  let durumuDegisecek = 0;
  let iadeyeDonecek = 0;
  let tutariDegisecek = 0;
  let adediDegisecek = 0;
  const durumOrnek: DurumDegisimi[] = [];

  for (const k of kayitlar) {
    const m = mevcutMap.get(k.key);
    if (!m) {
      yeni++;
      continue;
    }
    guncellenecek++;

    if ((m.status ?? "") !== k.status) {
      durumuDegisecek++;
      const dondu = !iadeMi(m.status ?? "") && iadeMi(k.status);
      if (dondu) iadeyeDonecek++;
      // İadeye dönenler listenin BAŞINDA: geçmiş bir aktarımda 21 iade 12 gün
      // satış sayılmıştı, bu satırlar gözden kaçmamalı.
      const kayit: DurumDegisimi = {
        sku: k.modelNumber,
        orderNumber: k.orderNumber,
        eski: m.status ?? "—",
        yeni: k.status,
        iadeyeDondu: dondu,
      };
      if (dondu) durumOrnek.unshift(kayit);
      else durumOrnek.push(kayit);
    }
    if (m.quantity !== k.quantity) adediDegisecek++;
    const eskiTutar = m.total == null ? null : Math.round(m.total * 100) / 100;
    if (eskiTutar !== k.totalAmountTry) tutariDegisecek++;
  }

  const eslesmeyen = kayitlar.filter((k) => !k.productId);
  const ornekMap = new Map<string, { model: string | null; urun: string | null; adet: number }>();
  for (const e of eslesmeyen) {
    const key = e.modelNumber ?? "(model yok)";
    const v = ornekMap.get(key);
    if (v) v.adet++;
    else ornekMap.set(key, { model: e.modelNumber, urun: e.productName, adet: 1 });
  }

  const tarihler = kayitlar.map((k) => k.orderDate.getTime());
  const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

  return {
    toplamSatir: kayitlar.length,
    yeni,
    guncellenecek,
    durumuDegisecek,
    iadeyeDonecek,
    tutariDegisecek,
    adediDegisecek,
    eslesmeyenUrun: eslesmeyen.length,
    eslesmeyenOrnek: [...ornekMap.values()].sort((a, b) => b.adet - a.adet).slice(0, 10),
    durumOrnek: durumOrnek.slice(0, 25),
    tarihBas: tarihler.length ? iso(Math.min(...tarihler)) : null,
    tarihSon: tarihler.length ? iso(Math.max(...tarihler)) : null,
    atlanan,
    dosyaIciMukerrer,
  };
}

async function mevcutSatirlar(kayitlar: EntegraRecord[]): Promise<MevcutSatir[]> {
  const out: MevcutSatir[] = [];
  for (let i = 0; i < kayitlar.length; i += 1000) {
    const parca = kayitlar.slice(i, i + 1000);
    const rows = await prisma.$queryRawUnsafe<MevcutSatir[]>(
      `SELECT channel, "orderNumber", "externalLineId", status, quantity,
              "totalAmountTry"::float8 AS total
         FROM "MarketplaceSalesRecord"
        WHERE (channel, "orderNumber", "externalLineId") IN (
                SELECT * FROM unnest($1::text[], $2::text[], $3::text[])
              )`,
      parca.map((k) => k.channel),
      parca.map((k) => k.orderNumber),
      parca.map((k) => k.externalLineId)
    );
    out.push(...rows);
  }
  return out;
}

/* ──────────────────────────────────── yazma ─────────────────────────────── */

export interface YazmaSonucu {
  yeni: number;
  guncellenen: number;
  atlanan: number;
  sureMs: number;
}

const PARCA = 250;

/**
 * Onaylanmış yüklemeyi yazar: önce UPDATE, sonra INSERT ... ON CONFLICT DO NOTHING.
 *
 * UPDATE'te bilerek DOKUNULMAYANLAR:
 *   • customerId — başka bir akış bağlamış olabilir, yükleme müşteri türetmiyor.
 *   • productId  — yeni türetme null ise ESKİSİ korunur (COALESCE); aksi hâlde
 *     elde tutulan iyi bir bağ, modeli bu sefer eşleşmedi diye silinirdi.
 */
export async function yaz(kayitlar: EntegraRecord[]): Promise<YazmaSonucu> {
  const t0 = Date.now();
  let guncellenen = 0;
  let yeni = 0;

  // Parametre dizileri SQL ile AYNI sütun listesinden üretilir (lib/entegra/sql.ts).
  // unnest konuma göre eşlediği için ayrı listeler bir gün kayarsa veri sessizce
  // yanlış kolona yazılırdı.
  const us = updateSql();
  const is_ = insertSql();

  for (let i = 0; i < kayitlar.length; i += PARCA) {
    const parca = kayitlar.slice(i, i + PARCA);
    guncellenen += await prisma.$executeRawUnsafe(
      us,
      ...UPDATE_COLS.map((c) => parca.map(c.al))
    );
    yeni += await prisma.$executeRawUnsafe(
      is_,
      ...INSERT_COLS.map((c) => parca.map(c.al))
    );
  }

  return {
    yeni,
    guncellenen,
    // UPDATE de INSERT de tutmadıysa satır atlanmıştır (ON CONFLICT DO NOTHING).
    atlanan: kayitlar.length - yeni - guncellenen,
    sureMs: Date.now() - t0,
  };
}

/* ─────────────────────────────── ortak hazırlık ─────────────────────────── */

export interface Hazirlik {
  kayitlar: EntegraRecord[];
  atlanan: { satir: number; sebep: string }[];
  dosyaIciMukerrer: number;
  eksikSutunlar: string[];
}

/**
 * Dosyayı ayrıştırır ve ürünleri eşleştirir. Önizleme ve yazma uçlarının
 * İKİSİ de bunu kullanır — ayrı yazılsalardı önizlemede görülen eşleşme ile
 * yazılan eşleşme farklı olabilirdi.
 */
export async function hazirla(buffer: Buffer): Promise<Hazirlik> {
  const p = parseEntegraFile(buffer);
  if (p.eksikSutunlar.length > 0) {
    return { kayitlar: [], atlanan: [], dosyaIciMukerrer: 0, eksikSutunlar: p.eksikSutunlar };
  }
  await eslestir(p.kayitlar);
  return {
    kayitlar: p.kayitlar,
    atlanan: p.atlanan,
    dosyaIciMukerrer: p.dosyaIciMukerrer,
    eksikSutunlar: [],
  };
}
