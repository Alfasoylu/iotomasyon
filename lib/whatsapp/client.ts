/**
 * WhatsApp Cloud API istemcisi — gönderim.
 *
 * ⚠️ RESMÎ API ŞART. whatsapp-web.js / Baileys gibi QR ile telefona bağlanan
 * kütüphaneler WhatsApp şartlarına aykırıdır ve NUMARAYI BANLATIR. Numara
 * hem sipariş bildiriminde hem müşteri iletişiminde kullanılıyor; banlanırsa
 * ikisi birden gider.
 *
 * ⚠️ GRUBA MESAJ ATILAMAZ. Cloud API yalnız birebir mesajlaşır. Ekibe
 * bildirim, herkese AYRI gönderilerek çözülür (ve her biri ayrı ücretlenir).
 *
 * PENCERE KURALI: Karşı taraf son 24 saat içinde yazmadıysa serbest metin
 * gönderilemez, yalnız ONAYLI ŞABLON gider. Bu yüzden `sendText` pencereyi
 * kontrol eder ve kapalıysa göndermeyi DENEMEZ — denemek Meta tarafında
 * hata üretir ve sebebi log'da kaybolur.
 */

import { cleanParam } from "./phone";

const GRAPH = "https://graph.facebook.com/v21.0";

export type WaSendResult =
  | { ok: true; waMessageId?: string }
  | { ok: false; reason: "yapilandirilmadi" | "pencere_kapali" | "hata"; detail?: string };

export function whatsappConfigured(): boolean {
  return Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

async function post(body: Record<string, unknown>): Promise<WaSendResult> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) return { ok: false, reason: "yapilandirilmadi" };

  try {
    const res = await fetch(`${GRAPH}/${phoneId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const json: unknown = await res.json().catch(() => ({}));
    const j = json as { error?: { code?: number; message?: string }; messages?: Array<{ id?: string }> };
    if (!res.ok) {
      // Meta'nin hata metni teshisin tamamidir (sablon adi yanlis, numara
      // alici listesinde yok, token suresi dolmus...). Yutulursa sebep bulunamaz.
      return {
        ok: false,
        reason: "hata",
        detail: `${res.status} ${j.error?.code ?? ""} ${j.error?.message ?? ""}`.trim(),
      };
    }
    return { ok: true, waMessageId: j.messages?.[0]?.id };
  } catch (e) {
    return { ok: false, reason: "hata", detail: e instanceof Error ? e.message : "ag hatasi" };
  }
}

/**
 * Onaylı şablon gönderir — pencere açık olmasa da çalışır.
 *
 * Dil kodu şablondakiyle BİREBİR aynı olmalı; tutmazsa Meta `132001` döner ve
 * mesaj hiç gitmez. Varsayılan `WHATSAPP_TEMPLATE_LANG`'dan okunur ki şablon
 * dili değiştiğinde tek yerden ayarlansın.
 */
export async function sendTemplate(
  to: string,
  templateName: string,
  params: string[] = [],
  lang?: string
): Promise<WaSendResult> {
  return post({
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: lang ?? process.env.WHATSAPP_TEMPLATE_LANG ?? "tr" },
      components: params.length
        ? [{ type: "body", parameters: params.map((p) => ({ type: "text", text: cleanParam(p) })) }]
        : [],
    },
  });
}

/**
 * Serbest metin gönderir. YALNIZ 24 saatlik pencere açıkken çalışır.
 * `windowIsOpen` çağıran tarafından hesaplanır (bkz. phone.ts → windowOpen).
 */
export async function sendText(
  to: string,
  text: string,
  windowIsOpen: boolean
): Promise<WaSendResult> {
  if (!windowIsOpen) {
    return {
      ok: false,
      reason: "pencere_kapali",
      detail:
        "Karsi taraf son 24 saatte yazmadi. Serbest metin gonderilemez; " +
        "once onayli sablon gonderip cevap bekleyin.",
    };
  }
  return post({
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { preview_url: false, body: text.slice(0, 4000) },
  });
}
