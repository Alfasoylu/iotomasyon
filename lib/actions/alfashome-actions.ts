"use server";

import { z } from "zod";

import { alfasBaglanti } from "@/lib/alfashome/config";
import { requireUser, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import type { ActionResult } from "@/types/actions";

/**
 * ALFAS Home bağlantı ayarı — kaydet + bağlantıyı dene.
 *
 * NEDEN PANELDEN: adres ve jeton env'de tutulunca her değişiklik Vercel
 * paneline girmeyi ve yeniden dağıtım beklemeyi gerektiriyordu. Trendyol /
 * Hepsiburada kimlik bilgileri de veritabanında (aynı mimari); buradan
 * kaydedilen değer ANINDA geçerli olur.
 *
 * ⚠️ JETON BOŞ GÖNDERİLİRSE MEVCUT DEĞER KORUNUR. Form kayıtlı jetonu
 * tarayıcıya geri basmıyor (sır her sayfa görüntülemesinde HTML'e gömülmesin);
 * bu yüzden "boş" = "dokunmadım" demek. Boşu "sil" saymak, adı değiştirmek
 * isteyen kullanıcının bağlantısını sessizce koparırdı.
 *
 * ⚠️ HTTP ADRESİ REDDEDİLİR. Jeton `Authorization` başlığında gidiyor; şifresiz
 * bağlantıda ağı dinleyen onu okur.
 */

const PERM_DENIED = { ok: false, message: "Bu işlem için yetkiniz yok." } as const;

/** ALFAS tarafındaki alt sınırla AYNI (backend/src/lib/crm-auth.ts). */
const MIN_TOKEN = 24;

const ayarSchema = z.object({
  baseUrl: z
    .string()
    .trim()
    .max(300)
    .refine((v) => v === "" || /^https:\/\/[^\s]+$/i.test(v), {
      message: "Adres https:// ile başlamalı.",
    }),
  // Boş = mevcut jetona dokunma.
  token: z.string().trim().max(300),
  isEnabled: z.boolean(),
});

export type AlfasAyarValues = z.infer<typeof ayarSchema>;

export async function saveAlfashomeConfigAction(values: AlfasAyarValues): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.EXECUTIVE_READ))) return PERM_DENIED;

  const parsed = ayarSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Form alanlarını kontrol edin." };
  }
  const { baseUrl, token, isEnabled } = parsed.data;

  // Jeton verilmişse alt sınırı burada da uygula: ALFAS 24 karakterden kısa
  // jetonu zaten reddediyor (503) ve kullanıcı sebebini panelde göremezdi.
  if (token && token.length < MIN_TOKEN) {
    return { ok: false, message: `Jeton en az ${MIN_TOKEN} karakter olmalı (ALFAS kısa jetonu reddeder).` };
  }
  if (isEnabled && !baseUrl) {
    return { ok: false, message: "Bağlantıyı açmak için adres gerekli." };
  }

  try {
    const mevcut = await prisma.alfashomeConfig.findUnique({
      where: { id: "singleton" },
      select: { token: true },
    });
    // Boş jeton = "dokunmadım" (bkz. dosya başı).
    const yeniToken = token || mevcut?.token || "";

    if (isEnabled && !yeniToken) {
      return { ok: false, message: "Bağlantıyı açmak için jeton gerekli." };
    }

    await prisma.alfashomeConfig.upsert({
      where: { id: "singleton" },
      update: { baseUrl, token: yeniToken, isEnabled, updatedAt: new Date() },
      create: { id: "singleton", baseUrl, token: yeniToken, isEnabled, updatedAt: new Date() },
    });
    return { ok: true };
  } catch {
    return { ok: false, message: "Ayar kaydedilemedi." };
  }
}

/**
 * Bağlantıyı dener: `/crm/orders?limit=1` çağrılır, yalnız SONUÇ bildirilir.
 * Veri döndürmez — buton "çalışıyor mu?" sorusunu yanıtlamak için var.
 *
 * ⚠️ Başarı damgası (`lastOkAt`) yalnız gerçekten 200 alındığında yazılır;
 * "kaydettim" ile "çalışıyor" ayrı şeyler.
 */
export async function testAlfashomeConnectionAction(): Promise<
  ActionResult & { connectionMessage?: string }
> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.EXECUTIVE_READ))) return PERM_DENIED;

  const b = await alfasBaglanti();
  if (!b.baseUrl || !b.token) {
    return {
      ok: false,
      message: "Önce adres ve jetonu kaydedin.",
      connectionMessage: "Yapılandırma eksik.",
    };
  }

  try {
    const r = await fetch(`${b.baseUrl}/crm/orders?limit=1`, {
      headers: { Authorization: `Bearer ${b.token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });

    if (r.ok) {
      const j = (await r.json()) as { adet?: number };
      try {
        await prisma.alfashomeConfig.update({
          where: { id: "singleton" },
          data: { lastOkAt: new Date() },
        });
      } catch {
        // Ayar env'den geliyorsa güncellenecek satır yok — sorun değil.
      }
      return {
        ok: true,
        connectionMessage: `Bağlantı çalışıyor. Son siparişler okunabiliyor (${j?.adet ?? 0} kayıt döndü).`,
      };
    }

    // Kullanıcıya NE YAPACAĞINI söyle: iki durum neredeyse her zaman bu ikisi.
    const mesaj =
      r.status === 401
        ? "Jeton geçersiz (401). ALFAS tarafındaki CRM_API_TOKEN ile birebir aynı olmalı."
        : r.status === 503
          ? "ALFAS tarafında jeton tanımlı değil ya da 24 karakterden kısa (503)."
          : `ALFAS ${r.status} döndü.`;
    return { ok: false, message: mesaj, connectionMessage: mesaj };
  } catch (e: unknown) {
    const h = e as { name?: string; message?: string };
    const zamanAsimi = h?.name === "TimeoutError" || h?.name === "AbortError";
    const mesaj = zamanAsimi
      ? "ALFAS zamanında yanıt vermedi (12 sn)."
      : `ALFAS adresine ulaşılamadı: ${String(h?.message ?? "").slice(0, 120)}`;
    return { ok: false, message: mesaj, connectionMessage: mesaj };
  }
}
