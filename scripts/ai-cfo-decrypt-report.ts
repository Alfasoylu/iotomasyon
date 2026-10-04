// Off-line operator utility. Never invoked by Actions or the application.
import { constants, createDecipheriv, privateDecrypt } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

async function main() {
  const input = process.env.AI_CFO_ENCRYPTED_REPORT_PATH, output = process.env.AI_CFO_DECRYPTED_REPORT_PATH;
  const privateKeyPath = process.env.AI_CFO_DIAGNOSTIC_PRIVATE_KEY_FILE;
  if (!input || !output || !privateKeyPath) throw new Error("configuration_required");
  const bytes = await readFile(input);
  if (bytes.length > 3_000_000) throw new Error("report_too_large");
  const envelope = JSON.parse(bytes.toString("utf8"));
  if (envelope.version !== 1 || envelope.algorithm !== "RSA-OAEP-SHA256+AES-256-GCM") throw new Error("invalid_envelope");
  const key = privateDecrypt({ key: await readFile(privateKeyPath), padding: constants.RSA_PKCS1_OAEP_PADDING,
    oaepHash: "sha256" }, Buffer.from(envelope.wrappedKey, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.iv, "base64"));
  decipher.setAAD(Buffer.from(envelope.aad, "base64")); decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
  const plain = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, "base64")), decipher.final()]);
  JSON.parse(plain.toString("utf8"));
  await writeFile(output, plain, { mode: 0o600, flag: "wx" }); key.fill(0);
  console.log(JSON.stringify({ decrypted: true, detailsLogged: false }));
}
main().catch(() => { console.error(JSON.stringify({ decrypted: false, failure: "decryption_failed", detailsLogged: false })); process.exitCode = 1; });
