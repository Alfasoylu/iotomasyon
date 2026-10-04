import { Client } from "pg";
import { readFile } from "node:fs/promises";
import { createPublicKey } from "node:crypto";
import { cfoReaderOptions, checkCfoReaderAccess, cfoAccessFailure } from "../lib/cfo-agent/access-check";
import { collectCfoAdapterAudit } from "../lib/cfo-agent/adapter-audit";
import { writeCfoDiagnostic } from "../lib/cfo-agent/diagnostic-report";
import type { ReadSource, Row } from "../lib/cfo-agent/sources";

async function main() {
  const path = process.env.AI_CFO_ADAPTER_AUDIT_REPORT_PATH, recipient = process.env.AI_CFO_DIAGNOSTIC_PUBLIC_KEY_FILE;
  if (!path || !recipient) throw new Error("encrypted_audit_configuration_required");
  const key = createPublicKey(await readFile(recipient, "utf8"));
  if (key.asymmetricKeyType !== "rsa" || (key.asymmetricKeyDetails?.modulusLength ?? 0) < 3072) throw new Error("invalid_audit_recipient");
  const client = new Client(cfoReaderOptions(process.env.AI_CFO_READ_DATABASE_URL));
  try {
    await client.connect();
    const db: ReadSource = { async query<T extends Row>(sql: string, ...params: unknown[]) {
      return (await client.query(sql, params)).rows as T[];
    } };
    const access = await checkCfoReaderAccess(db);
    if (!access.productRowsVisible || access.missingOrUnreadable.length) throw new Error("business_sources_not_visible");
    const report = await collectCfoAdapterAudit(db);
    await writeCfoDiagnostic(path, report);
    console.log(JSON.stringify({ completed: true, encrypted: true, transactionReadOnly: true, productionApproval: false }));
  } finally { await client.end(); }
}
main().catch(error => {
  console.error(JSON.stringify({ completed: false, failure: cfoAccessFailure(error), detailsLogged: false }));
  process.exitCode = 1;
});
