/**
 * Supabase Storage — yapılandırma doğrulama ve yükleme.
 *
 * Neden var: 27.08.2026'da SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY Vercel
 * production'a eklendi, ama Storage şunu döndü:
 *
 *   {"statusCode":"403","error":"Unauthorized","message":"Invalid Compact JWS"}
 *
 * "Invalid Compact JWS" = gönderilen değer JWT olarak ayrıştırılamadı. Yani
 * anahtar yanlış değil, biçimi yanlış. Supabase iki anahtar sistemi sunuyor:
 * eski JWT anahtarları (eyJ… ile başlar) ve yeni format (sb_publishable_… /
 * sb_secret_…). Storage'ın REST ucu Authorization başlığını JWT olarak
 * ayrıştırdığı için yeni format anahtarla bu hatayı verir. Panelden kopyalarken
 * değere bulaşan tırnak veya satır sonu da aynı hataya yol açar.
 *
 * Bu modül değeri temizler, biçimini ÖNCEDEN doğrular ve hatayı Supabase'in
 * ham mesajı yerine ne yapılması gerektiğini söyleyen bir cümleyle bildirir.
 * İki çağrı yeri (CFO soru ekleri, ürün görselleri) aynı mantığı kullanır.
 */

export type StorageConfig = { url: string; key: string };

export type StorageConfigResult =
  | { ok: true; config: StorageConfig }
  | { ok: false; reason: string };

/** Panelden/Vercel'den kopyalanırken bulaşan boşluk ve sarmalayan tırnakları at. */
function clean(raw: string | undefined): string {
  if (!raw) return "";
  return raw
    .trim()
    .replace(/^(['"])([\s\S]*)\1$/, "$2")
    .trim();
}

/** Compact JWS: nokta ile ayrılmış üç base64url parça. Storage bunu bekliyor. */
function looksLikeJwt(key: string): boolean {
  return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key);
}

const LEGACY_KEY_HINT =
  "Supabase panelinde Settings → API → Legacy API keys altındaki service_role " +
  "anahtarını kullanın (eyJ… ile başlar).";

export function getStorageConfig(): StorageConfigResult {
  const url = clean(process.env.SUPABASE_URL).replace(/\/+$/, "");
  const key = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!url && !key) {
    return {
      ok: false,
      reason:
        "Depolama yapılandırması eksik: SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY tanımlı değil.",
    };
  }
  if (!url) return { ok: false, reason: "SUPABASE_URL tanımlı değil." };
  if (!key) return { ok: false, reason: "SUPABASE_SERVICE_ROLE_KEY tanımlı değil." };

  if (!/^https:\/\/[^/]+$/.test(url)) {
    return {
      ok: false,
      reason: `SUPABASE_URL geçersiz ("${url}"). https://<proje-ref>.supabase.co biçiminde olmalı.`,
    };
  }

  if (key.startsWith("sb_publishable_") || key.startsWith("sb_secret_")) {
    return {
      ok: false,
      reason:
        "SUPABASE_SERVICE_ROLE_KEY yeni format bir anahtar (sb_…). Storage, Authorization " +
        `başlığını JWT olarak ayrıştırdığı için bunu kabul etmiyor. ${LEGACY_KEY_HINT}`,
    };
  }

  if (!looksLikeJwt(key)) {
    return {
      ok: false,
      reason:
        "SUPABASE_SERVICE_ROLE_KEY geçerli bir JWT değil — Storage 'Invalid Compact JWS' döner. " +
        `Değerde satır sonu veya eksik karakter olabilir. ${LEGACY_KEY_HINT}`,
    };
  }

  return { ok: true, config: { url, key } };
}

export type UploadResult =
  | { ok: true; publicUrl: string }
  | { ok: false; reason: string };

/** Supabase'in ham hata gövdesini ne yapılacağını söyleyen bir cümleye çevir. */
function describeFailure(status: number, body: string): string {
  if (body.includes("Invalid Compact JWS")) {
    return `Anahtar JWT olarak ayrıştırılamadı (${status}). ${LEGACY_KEY_HINT}`;
  }
  if (body.includes("Bucket not found")) {
    return `Bucket bulunamadı (${status}). Supabase → Storage bölümünde bucket'ı oluşturun.`;
  }
  if (status === 401 || status === 403) {
    return `Yetki reddedildi (${status}). service_role anahtarı doğru projeye ait olmalı. ${body.slice(0, 120)}`;
  }
  if (status === 409) {
    return `Aynı isimde dosya zaten var (${status}).`;
  }
  return `Yükleme başarısız (${status}): ${body.slice(0, 160)}`;
}

export async function uploadObject(
  config: StorageConfig,
  bucket: string,
  path: string,
  file: File,
): Promise<UploadResult> {
  try {
    const res = await fetch(`${config.url}/storage/v1/object/${bucket}/${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.key}`,
        // supabase-js her istekte ikisini birden gönderir; ağ geçidi apikey bekleyebilir.
        apikey: config.key,
        "Content-Type": file.type || "application/octet-stream",
        "x-upsert": "false",
      },
      body: Buffer.from(await file.arrayBuffer()),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, reason: describeFailure(res.status, body) };
    }

    return {
      ok: true,
      publicUrl: `${config.url}/storage/v1/object/public/${bucket}/${path}`,
    };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : "bilinmeyen ağ hatası",
    };
  }
}
