/**
 * WhatsApp Cloud API webhook — gelen mesajlar ve durum güncellemeleri.
 *
 * ⚠️ BİR NUMARA = BİR WEBHOOK. Meta her WhatsApp numarası için TEK callback
 * adresi kabul eder. Bu yüzden gelen mesajların tek toplandığı yer burasıdır;
 * alfashome backend'i yalnız GÖNDERİR, cevapları göremez.
 *
 * GET  → Meta'nın doğrulama el sıkışması (hub.challenge)
 * POST → gelen mesaj / durum bildirimi
 *
 * ⚠️ İMZA DOĞRULAMASI ZORUNLU. Bu adres herkese açıktır; doğrulama olmadan
 * isteyen istediği "cevabı" sisteme yazdırabilir ve depo kayıtları
 * uydurulabilir. Meta gövdeyi App Secret ile imzalar (X-Hub-Signature-256).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/whatsapp/phone";
import { signatureValid } from "@/lib/whatsapp/signature";
import { linkReply } from "@/lib/whatsapp/runner";

export const dynamic = "force-dynamic";

/** Meta'nın el sıkışması: doğru verify token gelirse challenge aynen döner. */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const mode = sp.get("hub.mode");
  const token = sp.get("hub.verify_token");
  const challenge = sp.get("hub.challenge");

  const expected = process.env.WHATSAPP_VERIFY_TOKEN;
  if (!expected) {
    // Yapilandirilmamisken 200 donmek, Meta'ya "dogrulandi" demek olurdu.
    return NextResponse.json({ error: "WHATSAPP_VERIFY_TOKEN tanimli degil" }, { status: 503 });
  }
  if (mode === "subscribe" && token === expected && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: "dogrulama basarisiz" }, { status: 403 });
}

type WaValue = {
  messages?: Array<{ id?: string; from?: string; type?: string; text?: { body?: string } }>;
  statuses?: Array<{ id?: string; status?: string }>;
};

export async function POST(req: NextRequest) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "WHATSAPP_APP_SECRET tanimli degil" }, { status: 503 });
  }

  // Ham govde imza icin SART: JSON.parse sonrasi yeniden serialize etmek
  // byte'lari degistirir ve imza TUTMAZ.
  const raw = await req.text();
  if (!signatureValid(raw, req.headers.get("x-hub-signature-256"), secret)) {
    return NextResponse.json({ error: "imza gecersiz" }, { status: 401 });
  }

  let payload: { entry?: Array<{ changes?: Array<{ value?: WaValue }> }> };
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "gecersiz JSON" }, { status: 400 });
  }

  let kaydedilen = 0;
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};

      // ── Gelen mesajlar ──────────────────────────────────────────────────
      for (const m of value.messages ?? []) {
        const from = normalizePhone(m.from ?? "");
        if (!from || !m.id) continue;

        // Tanimadigimiz numaradan gelen mesaj KAYDEDILMEZ. Webhook adresi
        // herkese acik oldugu icin, her yabanci numaraya kayit acmak
        // tabloyu coplerle doldururdu.
        const contact = await prisma.whatsAppContact.findUnique({ where: { phone: from } });
        if (!contact) continue;

        const body = m.type === "text" ? (m.text?.body ?? "") : `[${m.type ?? "bilinmeyen"}]`;

        // Meta webhook'u AYNI olayi yeniden gonderir. Tekrar mi, yeni mi:
        // once bakiyoruz. Bu ayrim sart, cunku asagidaki cevap baglama islemi
        // tekrar edilirse ayni cevap ikinci bir soruyu da kapatirdi.
        const onceden = await prisma.whatsAppMessage.findUnique({
          where: { waMessageId: m.id },
          select: { id: true },
        });

        // upsert (create degil): iki webhook ayni anda gelirse create tekillik
        // ihlaliyle patlar ve Meta 500 gorup saatlerce yeniden dener.
        const kayit = await prisma.whatsAppMessage.upsert({
          where: { waMessageId: m.id },
          create: { contactId: contact.id, direction: "IN", waMessageId: m.id, body, status: "delivered" },
          update: {},
        });

        if (onceden) continue;

        // 24 saatlik serbest metin penceresi bu andan itibaren isler.
        await prisma.whatsAppContact.update({
          where: { id: contact.id },
          data: { lastInboundAt: new Date() },
        });

        // Cevabi bekleyen soruya bagla — kullanicinin asil istedigi bu:
        // "stok kac adet?" sorusu ile gelen "12" panelde yan yana dursun.
        await linkReply(contact.id, kayit.id);
        kaydedilen++;
      }

      // ── Durum guncellemeleri (sent/delivered/read/failed) ───────────────
      for (const s of value.statuses ?? []) {
        if (!s.id || !s.status) continue;
        await prisma.whatsAppMessage.updateMany({
          where: { waMessageId: s.id },
          data: { status: s.status },
        });
      }
    }
  }

  // Meta 200 DISINDA her yanitta yeniden dener. Islenemeyen bir olay icin
  // hata donmek, ayni webhook'un saatlerce tekrarlanmasina yol acar.
  return NextResponse.json({ ok: true, kaydedilen });
}
