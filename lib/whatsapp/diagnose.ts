/**
 * WhatsApp teşhisi (2026-10-10, CFO alarm şablonu 132001 "Template name does not exist in the translation").
 *
 * Gönderimin kullandığı anahtar + numara kimliğiyle Meta'ya SALT-OKUMA sorar: numara hangi WABA'da, anahtar hangi WABA'ları
 * görüyor, aranan şablonlar (ad → dil, durum, kategori) o WABA'larda var mı. Hiçbir şey göndermez/değiştirmez.
 * ⚠️ Anahtar asla dönmez; kimlikler ve numara maskelenir (yalnız son 4 hane) — çıktı CI günlüğüne düşer.
 */
const GRAPH = "https://graph.facebook.com/v21.0";

export const maskId = (id: string | null | undefined) => (id ? `…${String(id).slice(-4)}` : null);
export const maskPhone = (p: string | null | undefined) => (p ? `${p.replace(/\d(?=[\d\s-]{4})/g, "•")}` : null);

type Json = Record<string, unknown>;
export type TemplateSeen = { name: string; language: string; status: string; category: string };
export type WabaReport = { waba: string | null; containsPhone: boolean | null; templates: TemplateSeen[]; error?: string };
export type WhatsappDiagnosis = {
  configured: boolean;
  templateLang: string;
  phone: { id: string | null; display: string | null; verifiedName: string | null; error?: string };
  tokenWabas: { ids: (string | null)[]; error?: string };
  wabas: WabaReport[];
  verdict: string;
};

/** Saf karar: rapordan tek satır teşhis (test edilir). */
export function verdictOf(d: Omit<WhatsappDiagnosis, "verdict">, wanted: string): string {
  if (!d.configured) return "WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID tanımlı değil";
  if (d.phone.error) return `numara kimliği okunamadı: ${d.phone.error}`;
  const home = d.wabas.filter(w => w.containsPhone);
  if (!d.wabas.length) return `anahtar hiçbir WABA görmüyor${d.tokenWabas.error ? ` (${d.tokenWabas.error})` : ""} — şablonlar okunamadı`;
  if (!home.length) return "numara, anahtarın gördüğü WABA'ların hiçbirinde değil — numara kimliği ile anahtar farklı hesaplardan";
  const hits = home.flatMap(w => w.templates.filter(t => t.name === wanted));
  if (!hits.length) return `'${wanted}' numaranın WABA'sında (${home.map(w => w.waba).join(", ")}) YOK — şablon başka hesapta açılmış`;
  const ok = hits.find(t => t.language === d.templateLang && t.status === "APPROVED");
  if (ok) return `'${wanted}' ${d.templateLang} APPROVED numaranın WABA'sında — gönderim mümkün olmalı`;
  return `'${wanted}' var ama gönderilen dil '${d.templateLang}' ile onaylı değil: ${hits.map(t => `${t.language}/${t.status}`).join(", ")}`;
}

async function get(path: string, token: string): Promise<Json> {
  const res = await fetch(`${GRAPH}/${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const j = (await res.json().catch(() => ({}))) as Json;
  if (!res.ok) {
    const e = (j.error ?? {}) as { code?: number; message?: string };
    throw new Error(`${res.status} ${e.code ?? ""} ${e.message ?? ""}`.trim());
  }
  return j;
}

export async function diagnoseWhatsapp(wanted = ["cfo_alarm", "yeni_siparis"]): Promise<WhatsappDiagnosis> {
  const token = process.env.WHATSAPP_TOKEN?.trim() ?? "";
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() ?? "";
  const templateLang = process.env.WHATSAPP_TEMPLATE_LANG ?? "tr";
  const base: Omit<WhatsappDiagnosis, "verdict"> = { configured: Boolean(token && phoneId), templateLang,
    phone: { id: maskId(phoneId), display: null, verifiedName: null }, tokenWabas: { ids: [] }, wabas: [] };
  if (!base.configured) return { ...base, verdict: verdictOf(base, wanted[0]) };

  try {
    const p = await get(`${phoneId}?fields=display_phone_number,verified_name`, token);
    base.phone.display = maskPhone(p.display_phone_number as string);
    base.phone.verifiedName = (p.verified_name as string) ?? null;
  } catch (e) { base.phone.error = e instanceof Error ? e.message : "hata"; }

  let wabaIds: string[] = [];
  try {
    const d = await get(`debug_token?input_token=${encodeURIComponent(token)}`, token);
    const scopes = (((d.data as Json)?.granular_scopes as { scope: string; target_ids?: string[] }[]) ?? []);
    wabaIds = [...new Set(scopes.filter(s => s.scope.startsWith("whatsapp_business")).flatMap(s => s.target_ids ?? []))];
  } catch (e) { base.tokenWabas.error = e instanceof Error ? e.message : "hata"; }
  base.tokenWabas.ids = wabaIds.map(maskId);

  for (const w of wabaIds) {
    const r: WabaReport = { waba: maskId(w), containsPhone: null, templates: [] };
    try {
      const nums = await get(`${w}/phone_numbers?fields=id&limit=50`, token);
      r.containsPhone = ((nums.data as { id: string }[]) ?? []).some(n => n.id === phoneId);
      const t = await get(`${w}/message_templates?fields=name,language,status,category&limit=250`, token);
      r.templates = ((t.data as TemplateSeen[]) ?? []).filter(x => wanted.includes(x.name))
        .map(x => ({ name: x.name, language: x.language, status: x.status, category: x.category }));
    } catch (e) { r.error = e instanceof Error ? e.message : "hata"; }
    base.wabas.push(r);
  }
  return { ...base, verdict: verdictOf(base, wanted[0]) };
}
