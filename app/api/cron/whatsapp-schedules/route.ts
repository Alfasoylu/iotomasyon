/**
 * Zamanlanmış WhatsApp mesajları — cron uç noktası.
 *
 * ⚠️ `vercel.json`'a EKLENMEZ. Vercel Hobby yalnız GÜNLÜK cron'a izin veriyor
 * ve zaten iki günlük cron dolu; bu görev ise gün içinde saat başı kontrol
 * edilmeli (görev 08:30'da, bir başkası 17:00'de olabilir). PDKS
 * hatırlatmalarında kurulan yolun aynısı: harici bir zamanlayıcı
 * (cron-job.org / GitHub Actions) bu adresi saat başı çağırır.
 *
 * Kurulum: `Authorization: Bearer $CRON_SECRET` başlığıyla, saat başı:
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/whatsapp-schedules
 *
 * Saat başı çağrılmak SORUN DEĞİL: mükerrer freni `lastRunOn` damgasıdır
 * (lib/whatsapp/schedule.ts), yani günde en fazla bir kez gönderilir. Aynı
 * sebeple zamanlayıcı bir çağrıyı kaçırsa bile görev o gün içinde yine gider.
 */

import { NextRequest, NextResponse } from "next/server";

import { authorizeCron } from "@/lib/cron-auth";
import { runDueSchedules } from "@/lib/whatsapp/runner";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  // FAIL-CLOSED (lib/cron-auth.ts): CRON_SECRET yoksa 503, eşleşmiyorsa 401.
  // Bu uç MESAJ GÖNDERİR ve her mesaj ücretlidir; secret tanımsızken açık
  // bırakmak, isteyenin depo ekibine istediği kadar mesaj attırması demekti.
  const denied = authorizeCron(req);
  if (denied) return denied;

  try {
    const rapor = await runDueSchedules();

    if (rapor.yapilandirilmadi) {
      // Sessiz kalmak yerine SÖYLE: anahtar yokken hiçbir mesaj gitmez ama
      // uç nokta 200 döner; eksiklik ancak "mesaj hiç gelmedi" ile fark edilir.
      console.warn(
        "[wa-zamanlanmis] WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID tanımlı değil — hiçbir mesaj GÖNDERİLMEDİ."
      );
      return NextResponse.json({ ok: false, reason: "whatsapp yapılandırılmadı" });
    }

    for (const b of rapor.basarisiz) {
      console.error(`[wa-zamanlanmis] GÖNDERİLEMEDİ — ${b.gorev} → ${b.kisi}: ${b.sebep}`);
    }

    return NextResponse.json({ ok: true, ...rapor });
  } catch (e) {
    // Cron'un çökmesi sessiz durma demektir; sebebi log'a yaz.
    const mesaj = e instanceof Error ? e.message : String(e);
    console.error(`[wa-zamanlanmis] Hata: ${mesaj}`);
    return NextResponse.json({ ok: false, error: mesaj }, { status: 500 });
  }
}
