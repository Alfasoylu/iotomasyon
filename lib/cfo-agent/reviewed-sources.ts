import { createHash } from "node:crypto";
import { REVIEWED_CFO_SOURCE_BINDINGS, REVIEWED_CFO_VIEW_HASHES } from "./acceptance-profile";
import type { ReadSource } from "./sources";

// Reviewed from the encrypted, read-only 04.10.2026 catalog audit. No function
// bodies, bank records or cost table contents are copied into this public repo.
const hashes = {
  ...REVIEWED_CFO_VIEW_HASHES,
  cfo_nakit_kapisi: "04a8bd254e1e3e06bffe4a9269af882a180aec2f7b6e25aacd93a213cb389d16",
  cfo_nakit_projeksiyon: "3d5a2913aabf4835dd42fe4b28e1f6cdee130b1ee08716e31af1c622c4f17db2",
};
export const ALFAS_SOURCE_PROFILE = "alfas_2026_10_04";
export async function reviewedCfoSources(db: ReadSource, profile: string | undefined) {
  if (!profile) return null;
  if (profile !== ALFAS_SOURCE_PROFILE) throw new Error("unknown_cfo_source_profile");
  const definitions = await db.query<{ source: string; definition: string }>(`select c.relname::text as source,
      pg_get_viewdef(c.oid,true) as definition from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relkind in ('v','m') and c.relname=any($1::text[])
      union all select p.proname::text,pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.prokind='f' and p.proname='cfo_nakit_projeksiyon'
      and pg_get_function_identity_arguments(p.oid)='gun integer'`, Object.keys(hashes));
  for (const [source, hash] of Object.entries(hashes)) {
    const matches = definitions.filter(r => r.source === source);
    if (matches.length !== 1 || createHash("sha256").update(matches[0].definition).digest("hex") !== hash) {
      return { valid: false as const, reason: `reviewed_source_changed:${source}` };
    }
  }
  return { valid: true as const, projectionPositionColumn: "pozisyon", bindings: {
    ...REVIEWED_CFO_SOURCE_BINDINGS,
    cfo_kargo_tarife: { min_try: "alt_sinir", max_try: "ust_sinir", kargo_try: "toplam", channel: "pazaryeri", effective_from: "gecerli_tarih" },
    // The component table has no set_sku relation. Never alias model/grup into it.
  } };
}
