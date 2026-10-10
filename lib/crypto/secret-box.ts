// PAZARYERİ API KİMLİK BİLGİLERİ — veritabanında şifreli saklama (CFO-016 / RF-012, Alperen onayı 2026-10-10).
// AES-256-GCM; anahtar ortamdan: CREDENTIALS_ENC_KEY = 32 baytın base64'ü (`openssl rand -base64 32`). Biçim: "enc:v1:" + base64(iv12|tag16|şifreli).
// Geriye uyumlu: anahtar YOKSA yazma düz metin bırakır (bugünkü davranış) ve "enc:v1:" ile başlamayan eski değer olduğu gibi okunur —
// anahtar eklendikten sonra ayar sayfasından bir kez kaydetmek (ya da scripts/security/encrypt-credentials.ts) satırı şifreler.
// Anahtar kaybolur/değişirse şifreli değer çözülemez → boş döner (entegrasyon "yapılandırılmamış" görünür; yanlış anahtarla istek gitmez).
// Değerler hiçbir koşulda loglanmaz.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export const SECRET_PREFIX = "enc:v1:";

export function credentialKey(env: Record<string, string | undefined> = process.env): Buffer | null {
  const raw = env.CREDENTIALS_ENC_KEY?.trim();
  if (!raw) return null;
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("CREDENTIALS_ENC_KEY 32 baytın base64'ü olmalı");
  return key;
}

export const isEncrypted = (v: unknown): v is string => typeof v === "string" && v.startsWith(SECRET_PREFIX);

/** Düz metni şifreler. Anahtar yoksa, değer boşsa ya da zaten şifreliyse olduğu gibi döner. */
export function encryptSecret(plain: string, key: Buffer | null = credentialKey()): string {
  if (!key || !plain || isEncrypted(plain)) return plain;
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return SECRET_PREFIX + Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64");
}

/** Şifreli değeri çözer; eski düz metin olduğu gibi döner. Anahtar yok / yanlış / bozuk → "" (asla hata metni ya da şifreli değer sızmaz). */
export function decryptSecret(value: string, key: Buffer | null = credentialKey()): string {
  if (!isEncrypted(value)) return value;
  if (!key) return "";
  try {
    const buf = Buffer.from(value.slice(SECRET_PREFIX.length), "base64");
    const d = createDecipheriv("aes-256-gcm", key, buf.subarray(0, 12));
    d.setAuthTag(buf.subarray(12, 28));
    return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString("utf8");
  } catch {
    return "";
  }
}

/** Şifreli saklanan alanlar (model → alan). Prisma eklentisi ve dönüşüm betiği bu listeyi okur. */
export const SECRET_FIELDS: Readonly<Record<string, readonly string[]>> = {
  trendyolConfig: ["apiKey", "apiSecret"],
  hepsiburadaConfig: ["password"],
  alfashomeConfig: ["token"],
};

/** Yazma verisindeki gizli alanları şifreler (create/update/upsert verisi; Prisma `{ set: x }` biçimi dahil). */
export function encryptData<T>(data: T, fields: readonly string[], key: Buffer | null = credentialKey()): T {
  if (!data || typeof data !== "object" || !key) return data;
  const out = { ...(data as Record<string, unknown>) };
  for (const f of fields) {
    const v = out[f];
    if (typeof v === "string") out[f] = encryptSecret(v, key);
    else if (v && typeof v === "object" && typeof (v as { set?: unknown }).set === "string") out[f] = { ...v, set: encryptSecret((v as { set: string }).set, key) };
  }
  return out as T;
}

/** Okuma sonucundaki gizli alanları çözer (tek kayıt, dizi ya da null). */
export function decryptResult<T>(result: T, fields: readonly string[], key: Buffer | null = credentialKey()): T {
  if (Array.isArray(result)) return result.map(r => decryptResult(r, fields, key)) as T;
  if (!result || typeof result !== "object") return result;
  const out = { ...(result as Record<string, unknown>) };
  for (const f of fields) if (typeof out[f] === "string") out[f] = decryptSecret(out[f] as string, key);
  return out as T;
}
