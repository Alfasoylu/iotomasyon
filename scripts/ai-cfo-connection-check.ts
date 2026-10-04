import { Client } from "pg";
import { cfoReaderOptions, checkCfoReaderAccess, cfoAccessFailure } from "../lib/cfo-agent/access-check";
import type { ReadSource, Row } from "../lib/cfo-agent/sources";

async function main() {
  const client = new Client(cfoReaderOptions(process.env.AI_CFO_READ_DATABASE_URL));
  try {
    await client.connect();
    const db: ReadSource = { async query<T extends Row>(sql: string, ...params: unknown[]) {
      return (await client.query(sql, params)).rows as T[];
    } };
    const report = await checkCfoReaderAccess(db);
    console.log(JSON.stringify({ connected: report.connected, readerRoleVerified: report.readerRoleVerified,
      transactionReadOnly: report.transactionReadOnly, tlsVerified: report.tlsVerified,
      productRowsVisible: report.productRowsVisible, missingOrUnreadable: report.missingOrUnreadable,
      checkedAt: report.checkedAt, limitations: report.limitations }, null, 2));
  } finally { await client.end(); }
}

main().catch(error => {
  console.error(JSON.stringify({ connected: false, failure: cfoAccessFailure(error), secretsLogged: false }));
  process.exitCode = 1;
});
