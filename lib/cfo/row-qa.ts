import "server-only";
import { skuKey } from "../cfo-agent/sku";
import { workflowId } from "../cfo-agent/workflow-plan";
import { prisma } from "@/lib/prisma";

/**
 * Satır bazında soru-cevap — bilginin biriktiği yer.
 *
 * NEDEN: panel bir şeyi bilmediğinde bunu ya sessizce atlıyordu (birim maliyeti
 * olmayan kalem tutara girmiyor, parti toplamı olduğundan düşük görünüyor) ya da
 * bir rozetle geçiştiriyordu ("oran güveni: düşük"). Oysa cevabı bilen kişi
 * ekrana bakan kişiydi; yazacak yeri yoktu.
 *
 * Türetilmiş sorular öncelik bütçesiyle veya kullanıcının açık isteğiyle ortak
 * `cfo_question` kaydına bağlanır. Cevap /cfo/sorular üzerinden verilir; satır
 * yalnız aynı kaydı, durumunu ve cevabını gösterir. Sayfa okumak soru yaratmaz.
 * İsteğe bağlı plan notları da aynı tabloda saklanır.
 *
 * Yeni tablo açılmadı: CFO zaten `cfo_question`'ı okuyor. Eksik olan tek şey
 * "hangi satır hakkında" bilgisiydi (scope + entity_key + code).
 */

export type SoruKodu =
  | "PLAN_NOTU"
  | "MALIYET_YOK"
  | "KAPSAM_UZUN"
  | "ORAN_GUVENI_DUSUK"
  | "MALIYET_SUPHELI";

export type Kapsam = "ITHALAT_SATIRI" | "KAZANAN_SATIRI";

/** Ekrana çıkan soru — türetilmiş ya da kayıtlı. */
export type SatirSorusu = {
  code: string;
  questionId?: string;
  status?: string;
  /** Sorunun kendisi. Cevaplanabilir olmalı: neyin, hangi birimde istendiği yazar. */
  soru: string;
  /** Neden soruyoruz — cevap vermeye değer mi, kullanıcı bunu bilmeli. */
  neden: string;
  area: string;
  /** Kayıtlı cevap varsa. */
  cevap: string | null;
  cevapTarihi: Date | null;
  cevaplayan: string | null;
  /** CFO cevabı işledi mi (ör. kanal oranını güncelledi mi). */
  islendiTarihi: Date | null;
  islemNotu: string | null;
};

export type UrunKarari = {
  sku: string;
  karar: string;
  sebep: string;
  gecerli_bitis: Date | null;
  karar_veren: string | null;
  updated_at: Date;
};

export type KayitliSoru = {
  id: string;
  scope: string | null;
  entity_key: string | null;
  code: string | null;
  question: string;
  why: string | null;
  area: string;
  status: string;
  answer: string | null;
  answeredAt: Date | null;
  answeredBy: string | null;
  processedAt: Date | null;
  processNote: string | null;
};

export const anahtar = (a: string, b: string) => `${a}|${b}`;

/** Kayıtlı cevaplar + ürün kararları. Bir sayfa için tek çağrı. */
export async function loadRowQa(kapsam: Kapsam, anahtarlar: string[]) {

  const [sorular, kararlar] = await Promise.all([
    prisma.$queryRaw<KayitliSoru[]>`
      select id, scope, entity_key, code, question, why, area, status,
             answer, "answeredAt", "answeredBy", "processedAt", "processNote"
        from cfo_question
       where scope = ${kapsam}
          or id = any(${anahtarlar.map(k=>workflowId('question:cost:'+skuKey(k.split('|').slice(1).join('|'))))}::text[])
       order by "askedAt" desc,id`,
    prisma.$queryRaw<UrunKarari[]>`
      select sku, karar, sebep, gecerli_bitis, karar_veren, updated_at
        from cfo_urun_karar
       where gecerli_bitis is null or gecerli_bitis >= current_date`,
  ]);

  const kararMap=new Map(kararlar.map(k=>[k.sku,k]));
  const kayitli = new Map<string, KayitliSoru[]>();
  for (const key of anahtarlar){
    const sku=skuKey(key.split('|').slice(1).join('|'));
    const relevant=sorular.filter(q=>skuKey(q.entity_key??'')===skuKey(key)||
      q.code==='MALIYET_YOK'&&skuKey(q.entity_key?.split('|').slice(1).join('|')??'')===sku||
      q.id===workflowId('question:cost:'+sku));
    kayitli.set(key,relevant.map(q=>({...q,code:q.code??'MALIYET_YOK'})));
  }

  return { kayitli, kararlar: kararMap };
}

/**
 * Bir ithalat satırı için açık sorular.
 *
 * Soruların hepsi TEK BİR CEVAPLA kapanacak kadar somut olmalı; "bu ürün hakkında
 * bilgi var mı" diye sormak cevap getirmiyor, "birim alış fiyatı kaç USD" getiriyor.
 */
export function ithalatSorulari(satir: {
  sku: string;
  product_name: string | null;
  maliyet_eksik: boolean;
  kapsam_ay: unknown;
  onerilen_adet: number;
  aylik_satis: unknown;
}): { code: SoruKodu; soru: string; neden: string; area: string }[] {
  const out: { code: SoruKodu; soru: string; neden: string; area: string }[] = [];
  const ad = satir.product_name ?? satir.sku;

  if (satir.maliyet_eksik) {
    out.push({
      code: "MALIYET_YOK",
      area: "maliyet",
      soru:
        `${ad} için birim alış fiyatı nedir? (RMB veya USD) ` +
        `Ayrıca birim ağırlığı kaç kg? Bu ikisi olmadan navlun ve indirilmiş maliyet hesaplanamıyor.`,
      neden:
        "Bu kalemin maliyeti bilinmediği için parti toplamına GİRMİYOR. Yani gerçek sipariş " +
        "tutarı ekranda görünenden yüksek ve minimum 10.000 USD kararı eksik toplam üzerinden veriliyor.",
    });
  }

  // Eşik 6 ay: nakit kapısı kapalıyken 6 aydan uzun rafta kalacak stok, o parayı
  // altı ay bağlamak demek. 12 ay seçseydik bugünkü listede hiçbir satır yakalamıyordu
  // (en uzun kapsam 8,0 ay) — hiç tetiklenmeyen soru, olmayan sorudur.
  const kapsam = satir.kapsam_ay == null ? null : Number(satir.kapsam_ay);
  if (kapsam != null && kapsam >= 6) {
    out.push({
      code: "KAPSAM_UZUN",
      area: "siparis",
      soru:
        `${ad} için önerilen ${satir.onerilen_adet} adet, bugünkü satış hızıyla ` +
        `${kapsam.toFixed(1)} ay yetiyor. Bu adet doğru mu, yoksa azaltalım mı? ` +
        `Kampanya/toptan gibi bir beklenti varsa yazın.`,
      neden:
        "Altı aydan uzun süre rafta kalacak stok, nakit kapısı kapalıyken bağlanan paradır. " +
        "Beklenti varsa adet doğru olabilir; yoksa aynı parayla daha hızlı dönen kalem alınır.",
    });
  }

  return out;
}

/** Bir "ayın kazananı" satırı için açık sorular. */
export function kazananSorulari(satir: {
  sku: string | null;
  ad: string | null;
  oran_guveni: string | null;
  ay: string;
  dusukKanallar: string[];
}): { code: SoruKodu; soru: string; neden: string; area: string }[] {
  const out: { code: SoruKodu; soru: string; neden: string; area: string }[] = [];
  const ad = satir.ad ?? satir.sku ?? "—";

  if (satir.oran_guveni === "DUSUK") {
    const kanal = satir.dusukKanallar.length > 0 ? satir.dusukKanallar.join(", ") : "ölçülmemiş kanallar";
    out.push({
      code: "ORAN_GUVENI_DUSUK",
      area: "marj",
      soru:
        `${ad} ${satir.ay} ayında ${kanal} kanalında/kanallarında satıldı. Bu kanalların net ` +
        `tahsilat oranı ÖLÇÜLMEDİ, %65 varsayıldı. Banka ekstresine göre 100 TL'lik satışta ` +
        `hesaba kaç TL giriyor? (Tek bir ödeme dökümü de yeter — hangi kanal, ne kadar satış, ne kadar yattı.)`,
      neden:
        "Bu ürünün kârı varsayılan bir orana dayanıyor. Gerçek kesinti varsayımdan yüksekse kâr " +
        "olduğundan büyük görünüyor ve 'ayın kazananı' sıralaması yanlış çıkıyor.",
    });
  }

  return out;
}

/** Türetilmiş soruları kayıtlı cevaplarla birleştirir. */
export function birlestir(
  turetilmis: { code: SoruKodu; soru: string; neden: string; area: string }[],
  kayitliListe: KayitliSoru[] | undefined,
): SatirSorusu[] {
  const kayitli = kayitliListe ?? [];
  const bul = (code: string) => kayitli.find((k) => k.code === code);

  const out: SatirSorusu[] = turetilmis.map((t) => {
    const k = bul(t.code);
    return {
      code: t.code,
      questionId: k?.id,
      status: k?.status,
      soru: k?.question ?? t.soru,
      neden: t.neden,
      area: t.area,
      cevap: k?.answer ?? null,
      cevapTarihi: k?.answeredAt ?? null,
      cevaplayan: k?.answeredBy ?? null,
      islendiTarihi: k?.processedAt ?? null,
      islemNotu: k?.processNote ?? null,
    };
  });

  // Türetilmiş listede olmayan ama kayıtta duran cevaplar da gösterilir: eksik
  // kapandığı için soru artık üretilmiyor olabilir, ama cevabın kendisi bilgidir.
  for (const k of kayitli) {
    if (!k.code || out.some((t) => t.code === k.code)) continue;
    out.push({
      code: k.code,
      questionId: k.id,
      status: k.status,
      soru: k.question,
      neden: k.why ?? "",
      area: k.area,
      cevap: k.answer,
      cevapTarihi: k.answeredAt,
      cevaplayan: k.answeredBy,
      islendiTarihi: k.processedAt,
      islemNotu: k.processNote,
    });
  }

  return out;
}
