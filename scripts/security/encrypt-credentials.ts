// Mevcut düz metin API kimlik bilgilerini şifreler (CFO-016 / RF-012). Ön koşul: CREDENTIALS_ENC_KEY (Vercel'e eklenen AYNI anahtar).
// Varsayılan kuru çalıştırma: yalnız kaç alanın düz metin olduğunu yazar; --apply ile günceller. Değerler asla yazdırılmaz.
// Tekrar çalıştırmak güvenli (şifreli alan atlanır). Alternatif: anahtar eklendikten sonra ayar sayfasından bir kez "Kaydet".
//   DATABASE_URL=… CREDENTIALS_ENC_KEY=… node --import tsx scripts/security/encrypt-credentials.ts [--apply]
import { Client } from "pg";
import { credentialKey, encryptSecret, isEncrypted } from "../../lib/crypto/secret-box";

const TABLES: Record<string, string[]> = { TrendyolConfig: ["apiKey", "apiSecret"], HepsiburadaConfig: ["password"], AlfashomeConfig: ["token"] };

async function main() {
  const key = credentialKey();
  if (!key) throw new Error("CREDENTIALS_ENC_KEY yok");
  const apply = process.argv.includes("--apply");
  const client = new Client({ connectionString: process.env.DATABASE_URL, application_name: "encrypt-credentials" });
  await client.connect();
  try {
    const report: Record<string, number> = {};
    for (const [table, cols] of Object.entries(TABLES)) {
      const rows = (await client.query(`select id, ${cols.map(c => `"${c}"`).join(", ")} from public."${table}"`)).rows as Record<string, string>[];
      for (const r of rows) {
        const plain = cols.filter(c => r[c] && !isEncrypted(r[c]));
        report[table] = (report[table] ?? 0) + plain.length;
        if (apply && plain.length)
          await client.query(`update public."${table}" set ${plain.map((c, i) => `"${c}" = $${i + 2}`).join(", ")} where id = $1`, [r.id, ...plain.map(c => encryptSecret(r[c], key))]);
      }
    }
    process.stdout.write(JSON.stringify({ apply, plaintextFields: report }) + "\n");
  } finally { await client.end(); }
}
main().catch(e => { console.error(e instanceof Error ? e.message : "failed"); process.exit(1); });
