import assert from "node:assert/strict";
import { maskId, maskPhone, verdictOf, type WhatsappDiagnosis } from "../lib/whatsapp/diagnose";

// WhatsApp teşhisi (132001): maskeleme (anahtar/kimlik/numara CI günlüğüne açık düşmez) + tek satır karar.
// Çalıştır: node --import tsx __tests__/whatsapp-diagnose.test.ts
assert.equal(maskId("1686831973058923"), "…8923");
assert.equal(maskId(null), null);
assert.equal(maskPhone("+1 555-000-1234"), "+• •••-•••-1234");
const base = (o: Partial<Omit<WhatsappDiagnosis, "verdict">> = {}): Omit<WhatsappDiagnosis, "verdict"> => ({ configured: true, templateLang: "tr",
  phone: { id: "…0001", display: null, verifiedName: null }, tokenWabas: { ids: ["…8923"] }, wabas: [], ...o });
const T = (language: string, status: string) => ({ name: "cfo_alarm", language, status, category: "MARKETING" });
assert.match(verdictOf(base({ configured: false }), "cfo_alarm"), /tanımlı değil/);
assert.match(verdictOf(base(), "cfo_alarm"), /hiçbir WABA görmüyor/);
assert.match(verdictOf(base({ wabas: [{ waba: "…8923", containsPhone: false, templates: [T("tr", "APPROVED")] }] }), "cfo_alarm"), /farklı hesaplardan/);
assert.match(verdictOf(base({ wabas: [{ waba: "…1111", containsPhone: true, templates: [] }] }), "cfo_alarm"), /YOK — şablon başka hesapta/);
assert.match(verdictOf(base({ wabas: [{ waba: "…8923", containsPhone: true, templates: [T("tr_TR", "APPROVED")] }] }), "cfo_alarm"), /dil 'tr' ile onaylı değil: tr_TR\/APPROVED/);
assert.match(verdictOf(base({ wabas: [{ waba: "…8923", containsPhone: true, templates: [T("tr", "PENDING")] }] }), "cfo_alarm"), /tr\/PENDING/);
assert.match(verdictOf(base({ wabas: [{ waba: "…8923", containsPhone: true, templates: [T("tr", "APPROVED")] }] }), "cfo_alarm"), /gönderim mümkün olmalı/);
console.log("WhatsApp teşhisi: maskeleme + karar (yapılandırma, WABA, numara-hesap, şablon yok, dil/durum) passed");
