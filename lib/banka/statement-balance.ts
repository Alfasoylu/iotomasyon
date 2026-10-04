/** File order is not chronological. Date-only statements cannot resolve intraday ordering. */
export function statementBalance(rows: { tarihIso: string; bakiyeTry: number | null }[]) {
  const date = rows.reduce<string | null>((latest, row) => !latest || row.tarihIso > latest ? row.tarihIso : latest, null);
  const latest = rows.filter(row => row.tarihIso === date);
  const balances = new Set(latest.map(row => row.bakiyeTry));
  const balance = balances.size === 1 ? latest[0]?.bakiyeTry ?? null : null;
  return { date, balance };
}
