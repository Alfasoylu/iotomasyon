export interface BankReviewSource { query<T>(sql: string, ...params: unknown[]): Promise<T[]> }
type Account = { id: string; name: string; accountType: string; balance: string | null; balanceAt: string | null };
type Import = { at: string; item: string; counts: string | null };
type Statement = { bank: string; rows: number; firstDate: string | null; lastDate: string | null; missingHashes: number; duplicateHashes: number; futureRows: number };

export async function bankReview(db: BankReviewSource) {
  const [clock] = await db.query<{ now: string }>(`SELECT now()::text AS now`);
  const now = new Date(clock.now);
  const accounts = await db.query<Account>(`SELECT id, name, "accountType", "balanceTry"::text AS balance,
    "lastUpdatedAt"::text AS "balanceAt" FROM cfo_bank_account WHERE "isActive" ORDER BY "sortOrder", id`);
  const logs = await db.query<Import>(`SELECT "changedAt"::text AS at, item, "newValue" AS counts
    FROM cfo_change_log WHERE area='banka' AND kind='aksiyon' AND item LIKE 'Banka dosyası: %'
    AND "changedAt" >= now() - interval '30 days' ORDER BY "changedAt" DESC, id DESC LIMIT 501`);
  const columns = await db.query<{ column_name: string }>(`SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='cfo_banka_hareket'`);
  const statementsAvailable = ['banka','tarih','satir_hash'].every(c => columns.some(row => row.column_name === c));
  const stats = statementsAvailable ? await db.query<Statement>(`SELECT banka AS bank, count(*)::int AS rows,
    to_char(min(tarih),'YYYY-MM-DD') AS "firstDate", to_char(max(tarih),'YYYY-MM-DD') AS "lastDate",
    count(*) FILTER(WHERE satir_hash IS NULL OR satir_hash='')::int AS "missingHashes",
    (count(satir_hash) FILTER(WHERE satir_hash<>'') - count(DISTINCT satir_hash) FILTER(WHERE satir_hash<>''))::int AS "duplicateHashes",
    count(*) FILTER(WHERE tarih > (now() AT TIME ZONE 'Europe/Istanbul')::date)::int AS "futureRows"
    FROM cfo_banka_hareket GROUP BY banka ORDER BY banka`) : [];
  const imports = logs.slice(0,500).map(log => {
    const match = log.counts?.match(/^(\d+) hareket eklendi; (\d+) mükerrer; (\d+) okunamadı$/);
    return { bank: log.item.slice('Banka dosyası: '.length), at: new Date(log.at).toISOString(),
      added: match ? Number(match[1]) : null, duplicatesSkipped: match ? Number(match[2]) : null,
      unreadable: match ? Number(match[3]) : null, countsKnown: Boolean(match) };
  });
  const banks = accounts.map(account => {
    const balanceAt = account.balanceAt ? new Date(account.balanceAt) : null;
    const validDate = balanceAt && Number.isFinite(balanceAt.getTime());
    const balanceKnown = account.balance !== null && Number.isFinite(Number(account.balance));
    const freshness = !balanceKnown ? 'balance_unknown' : !validDate ? 'timestamp_unknown'
      : balanceAt.getTime() > now.getTime() + 60000 ? 'future_timestamp'
      : now.getTime() - balanceAt.getTime() > 7 * 86400000 ? 'stale' : 'fresh';
    return { id: account.id, bank: account.name, accountType: account.accountType,
      balanceTry: balanceKnown ? account.balance : null, balanceAt: validDate ? balanceAt.toISOString() : null,
      freshness, ambiguousName: accounts.filter(a => a.name === account.name).length > 1,
      movements: stats.find(s => s.bank === account.name) ?? null,
      recentUploads: imports.filter(log => log.bank === account.name) };
  });
  return {
    completed: true, readOnly: true, asOf: now.toISOString(),
    summary: { activeAccounts: banks.length, freshBalances: banks.filter(b => b.freshness === 'fresh').length,
      balancesNeedingReview: banks.filter(b => b.freshness !== 'fresh').length,
      uploadedBanks: new Set(imports.map(i => i.bank)).size,
      unreadableRowsAcrossUploads: imports.some(i => !i.countsKnown) ? null : imports.reduce((n,i) => n + (i.unreadable ?? 0),0),
      importsWithUnreadableRows: imports.filter(i => (i.unreadable ?? 0) > 0).length },
    banks, imports, statementsAvailable,
    statementsWithoutActiveAccount: stats.filter(s => !accounts.some(a => a.name === s.bank)),
    recentPeriodDays: 30, importsTruncated: logs.length > 500,
    limitations: ["Only successful uploads are logged; rejected files are not included.",
      "Original files and unreadable-row details are not retained; investigating skipped rows requires the original file.",
      "Statement date ranges describe historical movements and do not verify the current bank balance.",
      "Rows are grouped by bank name; accounts with duplicate names cannot be reconciled separately."]
  };
}
