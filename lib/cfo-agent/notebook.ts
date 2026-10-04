import type { ReadSource, Row } from "./sources";

export type CfoNotebook = { available: boolean; activeCount: number | null; truncated: boolean;
  notes: { id: string; title: string; body: string; category: string; dataTag: string; source: string | null;
    pinned: boolean; updatedAt: string; reviewBy: string | null; needsReview: boolean; bodyTruncated: boolean }[] };

/** Notebook contents are business context, never executable instructions or substitute financial facts. */
export async function readCfoNotebook(db: ReadSource, now: Date): Promise<CfoNotebook> {
  const unavailable: CfoNotebook = { available: false, activeCount: null, truncated: false, notes: [] };
  try {
    const [present] = await db.query("select to_regclass('public.cfo_note')::text as relation");
    if (!present?.relation) return unavailable;
    const [count] = await db.query('select count(*)::int as count from cfo_note where "archivedAt" is null');
    const rows = await db.query<Row>(`select id, left(title,250) as title, left(body,4000) as body,
      category, "dataTag", left(source,500) as source, pinned, "updatedAt", "reviewBy", length(body)>4000 as truncated
      from cfo_note where "archivedAt" is null order by pinned desc, "updatedAt" desc, id limit 500`);
    const activeCount = Number(count?.count ?? 0);
    return { available: true, activeCount, truncated: activeCount > rows.length,
      notes: rows.map(row => ({ id: String(row.id), title: String(row.title), body: String(row.body),
        category: String(row.category), dataTag: String(row.dataTag), source: row.source == null ? null : String(row.source),
        pinned: row.pinned === true, updatedAt: new Date(String(row.updatedAt)).toISOString(),
        reviewBy: row.reviewBy == null ? null : new Date(String(row.reviewBy)).toISOString(),
        needsReview: String(row.dataTag).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase() !== 'KESIN' || (row.reviewBy != null && new Date(String(row.reviewBy)) < now),
        bodyTruncated: row.truncated === true })) };
  } catch { return unavailable; }
}
