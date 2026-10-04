import { constants, createCipheriv, createPublicKey, publicEncrypt, randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

// Financial diagnostics must not become plaintext artifacts in a public repo.
// Only the public recipient key is committed; private material lives outside it.
export function encryptCfoDiagnostic(value: unknown, pem: string) {
  const publicKey = createPublicKey(pem);
  if (publicKey.asymmetricKeyType !== "rsa" || (publicKey.asymmetricKeyDetails?.modulusLength ?? 0) < 3072) {
    throw new Error("diagnostic_recipient_key_invalid");
  }
  const bytes = Buffer.from(JSON.stringify(value), "utf8");
  if (bytes.length > 2_000_000) throw new Error("diagnostic_report_too_large");
  const key = randomBytes(32), iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const aad = Buffer.from("iotomasyon-cfo-diagnostic-v1");
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(bytes), cipher.final()]);
  const wrappedKey = publicEncrypt({ key: publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, key);
  key.fill(0);
  return { version: 1, algorithm: "RSA-OAEP-SHA256+AES-256-GCM", aad: aad.toString("base64"),
    wrappedKey: wrappedKey.toString("base64"), iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64") };
}

export async function writeCfoDiagnostic(path: string, value: unknown, env: Record<string, string | undefined> = process.env) {
  const recipient = env.AI_CFO_DIAGNOSTIC_PUBLIC_KEY_FILE;
  // CI may never silently fall back to a plaintext financial artifact.
  if (env.CI === "true" && !recipient) throw new Error("diagnostic_recipient_required_in_ci");
  const data = recipient ? encryptCfoDiagnostic(value, await readFile(recipient, "utf8")) : value;
  await writeFile(path, JSON.stringify(data, null, 2), { mode: 0o600, flag: "wx" });
}
