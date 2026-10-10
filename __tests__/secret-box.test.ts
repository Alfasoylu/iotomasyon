/**
 * API kimlik bilgisi şifreleme (lib/crypto/secret-box.ts, CFO-016/RF-012): AES-256-GCM gidiş-dönüş, rastgele IV, anahtar yokken düz metin
 * (geriye uyum), eski düz metin okunur, yanlış/eksik anahtar ve bozuk değer "" (sızıntı yok), Prisma `{ set }` biçimi, sonuç dizisi,
 * lib/prisma.ts eklentisi 3 modeli kapsar. Çalıştır: node --import tsx __tests__/secret-box.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { credentialKey, decryptResult, decryptSecret, encryptData, encryptSecret, isEncrypted, SECRET_FIELDS } from "../lib/crypto/secret-box";

const key = Buffer.alloc(32, 7), other = Buffer.alloc(32, 9);
const enc = encryptSecret("gizli-123", key);
assert.ok(isEncrypted(enc) && !enc.includes("gizli"));
assert.notEqual(encryptSecret("gizli-123", key), enc, "rastgele IV");
assert.equal(decryptSecret(enc, key), "gizli-123");
assert.equal(encryptSecret(enc, key), enc, "çift şifreleme yok");
assert.equal(encryptSecret("düz", null), "düz", "anahtar yok → bugünkü davranış");
assert.equal(encryptSecret("", key), "");
assert.equal(decryptSecret("eski-duz-metin", key), "eski-duz-metin", "eski düz metin okunur");
assert.equal(decryptSecret(enc, null), "", "anahtar yok → şifreli değer sızmaz");
assert.equal(decryptSecret(enc, other), "", "yanlış anahtar → boş");
assert.equal(decryptSecret(enc.slice(0, -4) + "AAAA", key), "", "bozuk değer → boş");
assert.equal(credentialKey({}), null);
assert.equal(credentialKey({ CREDENTIALS_ENC_KEY: key.toString("base64") })?.length, 32);
assert.throws(() => credentialKey({ CREDENTIALS_ENC_KEY: "kisa" }), /32 bayt/);

const d = encryptData({ supplierId: "1", apiKey: "K", apiSecret: { set: "S" }, isEnabled: true }, SECRET_FIELDS.trendyolConfig, key);
assert.equal(d.supplierId, "1"); assert.ok(isEncrypted(d.apiKey)); assert.ok(isEncrypted(d.apiSecret.set));
assert.deepEqual(decryptResult([{ apiKey: d.apiKey, apiSecret: d.apiSecret.set, supplierId: "1" }, null], SECRET_FIELDS.trendyolConfig, key),
  [{ apiKey: "K", apiSecret: "S", supplierId: "1" }, null]);
assert.deepEqual(encryptData({ apiKey: "K" }, ["apiKey"], null), { apiKey: "K" });

const prismaSrc = readFileSync("lib/prisma.ts", "utf8");
assert.match(prismaSrc, /withEncryptedSecrets\(base\)/, "tüm istemci eklentiyle döner");
assert.deepEqual(Object.keys(SECRET_FIELDS).sort(), ["alfashomeConfig", "hepsiburadaConfig", "trendyolConfig"]);
console.log("secret-box: AES-256-GCM gidiş-dönüş, anahtar yokken geriye uyum, sızıntısız hata, Prisma veri/sonuç dönüşümü, eklenti passed");
