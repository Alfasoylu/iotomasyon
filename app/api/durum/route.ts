/**
 * Kurulum durumu — SALT OKUNUR teşhis ucu.
 *
 * NEDEN VAR: Panel sayfaları kimlik doğrulaması arkasında. Bir env değişkeninin
 * canlıya gerçekten geçip geçmediğini Vercel panelinde "kaydettim" demek
 * KANITLAMAZ — env değişikliği yeniden deploy edilene kadar etkili olmaz ve bu
 * sessizdir: sayfa normal görünür, entegrasyon çalışmaz. Bu uç, kurulumu
 * dışarıdan ölçülebilir kılar.
 *
 * ⚠️ DEĞER DÖNDÜRMEZ. Yalnız "tanımlı mı" (boolean) ve biçim geçerliliği.
 * Anahtarın kendisi, uzunluğu, ilk/son karakterleri — hiçbiri dönmez.
 * `npm run check:durum` bunu testle sabitler.
 *
 * Herkese açık olması kasıtlı (alfashome'daki `/api/capi` ile aynı desen):
 * "WhatsApp yapılandırılmış" bilgisi saldırgana bir şey kazandırmaz, ama
 * kurulumu uzaktan doğrulamayı mümkün kılar. Değer sızdırmadığı için risk yok.
 *
 * Kullanım: curl https://iotomasyon.com/api/durum
 */

import { NextResponse } from "next/server";

import { normalizeAccountId } from "@/lib/meta/insights";

export const dynamic = "force-dynamic";

const tanimli = (v?: string) => Boolean(v && v.trim() !== "");

export async function GET() {
  const adHesap = process.env.META_AD_ACCOUNT_ID ?? "";

  return NextResponse.json(
    {
      whatsapp: {
        // Gönderim için gerekli ikili — bunlar olmadan hiçbir mesaj gitmez.
        token: tanimli(process.env.WHATSAPP_TOKEN),
        phoneNumberId: tanimli(process.env.WHATSAPP_PHONE_NUMBER_ID),
        // Webhook için gerekli ikili — bunlar olmadan gelen cevap kaydedilmez.
        appSecret: tanimli(process.env.WHATSAPP_APP_SECRET),
        verifyToken: tanimli(process.env.WHATSAPP_VERIFY_TOKEN),
        // Değer gizli DEĞİL ve yanlış yazımı (tr_TR gibi) gerçek bir arıza
        // sebebi: Meta şablonu bulamaz, 132001 döner. Bu yüzden gösteriliyor.
        templateLang: process.env.WHATSAPP_TEMPLATE_LANG ?? null,
      },
      reklam: {
        token: tanimli(process.env.META_ADS_TOKEN),
        hesapTanimli: tanimli(adHesap),
        // Biçim en sinsi hata: yanlış biçimde Graph "Unsupported get request"
        // der ve sebebi SÖYLEMEZ. Kimliğin kendisi dönmüyor, yalnız geçerliliği.
        hesapBicimiGecerli: normalizeAccountId(adHesap) !== "",
      },
      cron: {
        // #117 sonrası fail-closed: tanımsızsa TÜM cron uçları 503 döner ve
        // XML/Trendyol senkronları da sessizce durur.
        secret: tanimli(process.env.CRON_SECRET),
      },
    },
    { headers: { "cache-control": "no-store" } }
  );
}
