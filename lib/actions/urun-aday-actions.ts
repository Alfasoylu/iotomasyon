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
const MAX_BYTES = 10 * 1024 * 1024;
const MIME = ["image/jpeg", "image/png", "image/webp", "image/gif"];

type Sonuc = { ok: boolean; message?: string; url?: string };

function yenile(sku?: string) {
  revalidatePath("/admin/yeni-urunler");
  if (sku) revalidatePath(`/admin/yeni-urunler/${encodeURIComponent(sku)}`);
}

/** Serbest alanları kaydet. Boş string null'a çevrilir ki puanlama şaşmasın. */
export async function saveCandidateAction(
  id: string,
  sku: string,
  alanlar: Record<string, string>,
): Promise<Sonuc> {
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

  try {
    await prisma.$executeRaw`
      update urun_aday set
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
    return { ok: true, message: "Kaydedildi." };
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
    return { ok: false, message: "Maksimum 10 MB." };
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

    const [{ sira }] = await prisma.$queryRaw<{ sira: number }[]>`
      select coalesce(max(sira), -1) + 1 as sira
        from urun_aday_gorsel where aday_id = ${adayId} and tur = ${tur}`;

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
      const [row] = await prisma.$queryRaw<{ puan: number; eksikler: string[] }[]>`
        select puan, eksikler from urun_aday_skor where id = ${id}`;
      if (!row) return { ok: false, message: "Ürün bulunamadı." };
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
