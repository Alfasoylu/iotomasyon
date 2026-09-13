"use server";

/**
 * Yeni ürün adayları — alan kaydetme, görsel yükleme, ilan kararı.
 *
 * GÖRSEL TÜRÜ KRİTİK: tedarikçiden gelen görsellerin bir kısmı ÇİNCE bilgi
 * görselidir. Bunlar ilana KONULAMAZ — pazaryeri reddeder, müşteri okuyamaz.
 * Ama silmek de doğru değil: ürünün ölçüsü, montaj şeması, malzeme bilgisi
 * çoğu zaman yalnız o görselde var. Bu yüzden tür ZORUNLU seçilir, DB'de CHECK
 * ile sınırlanır ve ilan çıktısı `CINCE_BILGI` olanı hiç görmez.
 *
 * Türü yanlış seçmek geri alınabilir olmalı (insan hatası kaçınılmaz), o yüzden
 * `setImageKindAction` var — görseli silip yeniden yüklemeye gerek yok.
 */

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { getStorageConfig, uploadObject } from "@/lib/storage/supabase-storage";
import { GORSEL_TURLERI, PUAN_ESIGI, type GorselTuru } from "@/lib/urun-aday/sabitler";

const BUCKET = "urun-gorsel";
// Next.js sunucu eylemi sınırıyla (next.config.ts: 4mb) UYUMLU olmalı. Daha
// büyük yazarsak istek buraya hiç gelmez ve kullanıcı sebepsiz 404 görür.
const MAX_BYTES = 4 * 1024 * 1024;
const MIME = ["image/jpeg", "image/png", "image/webp", "image/gif"];

type Sonuc = { ok: boolean; message?: string; url?: string };

function yenile(sku?: string) {
  revalidatePath("/admin/yeni-urunler");
  if (sku) revalidatePath(`/admin/yeni-urunler/${encodeURIComponent(sku)}`);
}

/**
 * Serbest alanları kaydet. Boş string null'a çevrilir ki puanlama şaşmasın.
 *
 * SKU DEĞİŞTİRİLEBİLİR: faturadaki kod bizim katalog kodumuz olmak zorunda değil.
 * Değişirse `fatura_sku` sabit kaldığı için konteyner kalemiyle olan bağ kopmaz.
 * Benzersizlik DB'de unique ile zorlanıyor; burada anlaşılır mesaja çevriliyor.
 * Yeni sku dönülür çünkü sayfa adresi sku'ya bağlı — istemci oraya taşınmalı.
 */
export async function saveCandidateAction(
  id: string,
  sku: string,
  alanlar: Record<string, string>,
): Promise<Sonuc & { yeniSku?: string }> {
  await requirePermission(PERMISSIONS.PRODUCTS_UPDATE);

  const metin = (k: string) => {
    const v = (alanlar[k] ?? "").trim();
    return v.length > 0 ? v : null;
  };
  const sayi = (k: string) => {
    const v = (alanlar[k] ?? "").trim().replace(",", ".");
    if (v.length === 0) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  // SKU boş bırakılamaz: kaydın kimliği ve görsel yolunun kökü.
  const yeniSku = (alanlar.sku ?? "").trim();
  if (yeniSku.length === 0) return { ok: false, message: "SKU boş olamaz." };
  if (yeniSku.length > 80) return { ok: false, message: "SKU en fazla 80 karakter." };

  try {
    if (yeniSku !== sku) {
      const [cakisan] = await prisma.$queryRaw<{ id: string }[]>`
        select id from urun_aday where sku = ${yeniSku} and id <> ${id}`;
      if (cakisan) {
        return { ok: false, message: `"${yeniSku}" başka bir üründe kullanılıyor.` };
      }
    }

    await prisma.$executeRaw`
      update urun_aday set
        sku = ${yeniSku},
        ad_tr = ${metin("ad_tr")},
        marka = ${metin("marka")},
        kategori = ${metin("kategori")},
        aciklama = ${metin("aciklama")},
        aciklama_1688 = ${metin("aciklama_1688")},
        barkod = ${metin("barkod")},
        mensei = ${metin("mensei")},
        garanti_ay = ${sayi("garanti_ay")}::int,
        kutu_en_cm = ${sayi("kutu_en_cm")}::numeric,
        kutu_boy_cm = ${sayi("kutu_boy_cm")}::numeric,
        kutu_yuk_cm = ${sayi("kutu_yuk_cm")}::numeric,
        satis_try = ${sayi("satis_try")}::numeric,
        link_1688 = ${metin("link_1688")},
        note = ${metin("note")},
        updated_at = now()
      where id = ${id}`;
    yenile(sku);
    if (yeniSku !== sku) yenile(yeniSku);
    return {
      ok: true,
      message: yeniSku !== sku ? `Kaydedildi. SKU "${sku}" → "${yeniSku}".` : "Kaydedildi.",
      yeniSku,
    };
  } catch (e) {
    console.error("saveCandidateAction", sku, e);
    return { ok: false, message: "Kaydedilemedi." };
  }
}

/** Görsel yükle. Tür zorunlu — "sonra düzeltirim" diye boş geçilemez. */
export async function uploadCandidateImageAction(
  adayId: string,
  sku: string,
  formData: FormData,
): Promise<Sonuc> {
  await requirePermission(PERMISSIONS.PRODUCTS_UPDATE);

  const tur = String(formData.get("tur") ?? "");
  if (!GORSEL_TURLERI.includes(tur as GorselTuru)) {
    return { ok: false, message: "Görsel türü seçilmedi." };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Dosya seçilmedi." };
  }
  if (!MIME.includes(file.type)) {
    return { ok: false, message: "Sadece JPEG, PNG, WebP veya GIF." };
  }
  if (file.size > MAX_BYTES) {
    return {
      ok: false,
      message:
        `Dosya ${(file.size / 1024 / 1024).toFixed(1)} MB — sınır 4 MB. ` +
        `Normalde tarayıcı otomatik küçültür; küçülmediyse görseli 2000 piksele indirip tekrar deneyin.`,
    };
  }

  const storage = getStorageConfig();
  if (!storage.ok) return { ok: false, message: storage.reason };

  try {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    // Tür yola da yazılıyor: depoya bakan biri hangi görselin Çince bilgi
    // olduğunu veritabanına sormadan görsün.
    const guvenliSku = sku.replace(/[^\w.\-]+/g, "_").slice(0, 60);
    const path = `${guvenliSku}/${tur.toLowerCase()}/${Date.now()}.${ext}`;

    const res = await uploadObject(storage.config, BUCKET, path, file);
    if (!res.ok) return { ok: false, message: res.reason };

    // Sıra aday GENELİNDE tek: ana görsel bu sıranın ilki olduğu için tür
    // bazında saymak iki farklı "birinci" üretirdi.
    const [{ sira }] = await prisma.$queryRaw<{ sira: number }[]>`
      select coalesce(max(sira), -1) + 1 as sira
        from urun_aday_gorsel where aday_id = ${adayId}`;

    await prisma.$executeRaw`
      insert into urun_aday_gorsel (aday_id, url, tur, sira, dosya_adi, boyut_bayt)
      values (${adayId}, ${res.publicUrl}, ${tur}, ${sira}, ${file.name.slice(0, 200)}, ${file.size})`;

    yenile(sku);
    return { ok: true, message: "Görsel yüklendi.", url: res.publicUrl };
  } catch (e) {
    console.error("uploadCandidateImageAction", sku, e);
    return { ok: false, message: "Görsel kaydedilemedi." };
  }
}

/** Yanlış tür seçildiyse düzelt — yeniden yüklemeye gerek yok. */
export async function setImageKindAction(
  gorselId: number,
  sku: string,
  tur: string,
): Promise<Sonuc> {
  await requirePermission(PERMISSIONS.PRODUCTS_UPDATE);
  if (!GORSEL_TURLERI.includes(tur as GorselTuru)) {
    return { ok: false, message: "Geçersiz tür." };
  }
  try {
    await prisma.$executeRaw`update urun_aday_gorsel set tur = ${tur} where id = ${gorselId}`;
    yenile(sku);
    return { ok: true, message: "Tür güncellendi." };
  } catch (e) {
    console.error("setImageKindAction", gorselId, e);
    return { ok: false, message: "Tür değiştirilemedi." };
  }
}

/** Görseli kayıttan sil. Depodaki dosya kalır — geri almak gerekebilir. */
export async function deleteCandidateImageAction(
  gorselId: number,
  sku: string,
): Promise<Sonuc> {
  await requirePermission(PERMISSIONS.PRODUCTS_UPDATE);
  try {
    await prisma.$executeRaw`delete from urun_aday_gorsel where id = ${gorselId}`;
    yenile(sku);
    return { ok: true, message: "Görsel kaldırıldı." };
  } catch (e) {
    console.error("deleteCandidateImageAction", gorselId, e);
    return { ok: false, message: "Görsel kaldırılamadı." };
  }
}

/**
 * İlan durumu. HAZIR yapmak için puan eşiği DB'den doğrulanır — istemciden
 * gelen puana güvenilmez, kullanıcı sayfayı eski haliyle açmış olabilir.
 */
export async function setCandidateStatusAction(
  id: string,
  sku: string,
  durum: "TASLAK" | "HAZIR" | "LISTELENDI" | "REDDEDILDI",
  redSebep?: string,
): Promise<Sonuc> {
  await requirePermission(PERMISSIONS.PRODUCTS_UPDATE);

  try {
    if (durum === "HAZIR" || durum === "LISTELENDI") {
      const [row] = await prisma.$queryRaw<
        { puan: number; eksikler: string[]; katalogda_var: boolean; katalog_sku: string | null }[]
      >`select puan, eksikler, katalogda_var, katalog_sku
          from urun_aday_skor where id = ${id}`;
      if (!row) return { ok: false, message: "Ürün bulunamadı." };
      // Katalogdaki ürüne ikinci ilan açmak mükerrer listeleme demek; pazaryerleri
      // bunu cezalandırıyor. Ekrandaki rozet uyarı, kapı burası.
      if (row.katalogda_var) {
        return {
          ok: false,
          message:
            `Bu ürün katalogda zaten var (${row.katalog_sku}) — yeni ilan açılmaz. ` +
            "Gelen mal mevcut ilanın stoğudur. Eşleşme yanlışsa SKU'yu düzeltin.",
        };
      }
      if (row.puan < PUAN_ESIGI) {
        return {
          ok: false,
          message:
            `Puan ${row.puan}/${PUAN_ESIGI} — ilan açılamaz. Eksik: ` +
            (row.eksikler ?? []).join(", "),
        };
      }
    }

    if (durum === "REDDEDILDI" && !(redSebep ?? "").trim()) {
      return { ok: false, message: "Ret gerekçesi zorunlu." };
    }

    await prisma.$executeRaw`
      update urun_aday
         set durum = ${durum},
             red_sebep = ${durum === "REDDEDILDI" ? (redSebep ?? "").trim() : null},
             updated_at = now()
       where id = ${id}`;
    yenile(sku);
    return { ok: true, message: "Durum güncellendi." };
  } catch (e) {
    console.error("setCandidateStatusAction", sku, e);
    return { ok: false, message: "Durum güncellenemedi." };
  }
}

// ── Sıralama ─────────────────────────────────────────────────────────────────
//
// ANA GÖRSEL AYRI BİR ALAN DEĞİL: pazaryerleri "Görsel 1"i ana görsel sayar,
// dolayısıyla ana görsel = ilan sırasının ilki. Ayrı bir `ana_gorsel` bayrağı
// tutsaydık, bayrak ile sıra çelişebilirdi ve hangisinin geçerli olduğu
// belirsizleşirdi.
//
// Çince bilgi görselleri kendi aralarında sıralanır; ilan sırasına karışmazlar
// ve ana görsel olamazlar.

type GorselSira = { id: number; tur: string; sira: number };

/** Bir görselin ait olduğu sıralama grubu: ilan görselleri mi, Çince mi. */
const ayniGrup = (a: string, b: string) =>
  (a === "CINCE_BILGI") === (b === "CINCE_BILGI");

async function grubuOku(adayId: string) {
  return prisma.$queryRaw<GorselSira[]>`
    select id, tur, sira from urun_aday_gorsel
     where aday_id = ${adayId} order by sira, id`;
}

/** Verilen id sırasına göre sira sütununu 0..n-1 olarak yeniden yazar. */
async function sirayiYaz(sirali: GorselSira[]) {
  await prisma.$transaction(
    sirali.map((g, i) =>
      prisma.$executeRaw`update urun_aday_gorsel set sira = ${i} where id = ${g.id}`,
    ),
  );
}

/** Görseli kendi grubunda bir yukarı/aşağı taşı. */
export async function moveCandidateImageAction(
  adayId: string,
  sku: string,
  gorselId: number,
  yon: "yukari" | "asagi",
): Promise<Sonuc> {
  await requirePermission(PERMISSIONS.PRODUCTS_UPDATE);
  try {
    const hepsi = await grubuOku(adayId);
    const i = hepsi.findIndex((g) => g.id === gorselId);
    if (i < 0) return { ok: false, message: "Görsel bulunamadı." };

    // Aynı gruptaki komşuyu bul — arada farklı gruptan görsel varsa atlanır,
    // yoksa ürün görseli Çince görselin üstünden "zıplamış" gibi görünürdü.
    const adim = yon === "yukari" ? -1 : 1;
    let j = i + adim;
    while (j >= 0 && j < hepsi.length && !ayniGrup(hepsi[i].tur, hepsi[j].tur)) j += adim;
    if (j < 0 || j >= hepsi.length) return { ok: true, message: "Zaten uçta." };

    [hepsi[i], hepsi[j]] = [hepsi[j], hepsi[i]];
    await sirayiYaz(hepsi);
    yenile(sku);
    return { ok: true, message: "Sıra değişti." };
  } catch (e) {
    console.error("moveCandidateImageAction", gorselId, e);
    return { ok: false, message: "Sıra değiştirilemedi." };
  }
}

/** Ana görsel yap = ilan sırasının başına al. */
export async function setMainImageAction(
  adayId: string,
  sku: string,
  gorselId: number,
): Promise<Sonuc> {
  await requirePermission(PERMISSIONS.PRODUCTS_UPDATE);
  try {
    const hepsi = await grubuOku(adayId);
    const secili = hepsi.find((g) => g.id === gorselId);
    if (!secili) return { ok: false, message: "Görsel bulunamadı." };
    // Çince bilgi görseli ilana girmediği için ana görsel de olamaz.
    if (secili.tur === "CINCE_BILGI") {
      return { ok: false, message: "Çince bilgi görseli ana görsel olamaz — ilana girmiyor." };
    }

    const kalan = hepsi.filter((g) => g.id !== gorselId);
    await sirayiYaz([secili, ...kalan]);
    yenile(sku);
    return { ok: true, message: "Ana görsel seçildi." };
  } catch (e) {
    console.error("setMainImageAction", gorselId, e);
    return { ok: false, message: "Ana görsel seçilemedi." };
  }
}
