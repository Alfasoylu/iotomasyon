import { createHash } from "node:crypto";
import { REVIEWED_CFO_SOURCE_BINDINGS, REVIEWED_CFO_VIEW_HASHES } from "./acceptance-profile";
import type { ReadSource } from "./sources";

// Reviewed from the encrypted, read-only 04.10.2026 catalog audit. No function
// bodies, bank records or cost table contents are copied into this public repo.
// A source may list more than one accepted hash only during a controlled transition (code deploys before the DDL is applied, so the
// reviewed profile never goes dark); the old hash is removed in the production-sync PR right after the DDL.
export const REVIEWED_SOURCE_HASHES: Record<string, string | readonly string[]> = {
  ...REVIEWED_CFO_VIEW_HASHES,
  cfo_nakit_kapisi: "56a943eedf652851e15a74bb5e19c7516938f3c57708eea436d117d5dbbb546f", // 2026-10-10 CFO-006: sahsi filtre cfo_hesap_sahsi() (uretimde olculdu)
  cfo_nakit_projeksiyon: [
    "9f3b9b2e877d154f6eeb7516b6e594e4d30772025bd075be8fa023aaf155ca6a", // CFO-013 tek nakit yolu (migration 20261010110000): vadesi gecmisler bugune, diger tahsilat dahil
    "3d5a2913aabf4835dd42fe4b28e1f6cdee130b1ee08716e31af1c622c4f17db2", // onceki tanim (baseline 2026-10-06) — 110000 uygulaninca kaldirilir
  ],
};
const hashes = REVIEWED_SOURCE_HASHES;
export const ALFAS_SOURCE_PROFILE = "alfas_2026_10_04";
/** Reviewed profile is the default (hash-gated: a changed definition disables it and flags reviewed_source_changed).
 *  AI_CFO_SOURCE_PROFILE=off falls back to explicit AI_CFO_SOURCE_COLUMNS_JSON / AI_CFO_PROJECTION_POSITION_COLUMN only. */
export function resolveCfoSourceProfile(env: Record<string, string | undefined> = process.env): string | undefined {
  const value = env.AI_CFO_SOURCE_PROFILE?.trim();
  return !value ? ALFAS_SOURCE_PROFILE : value === "off" ? undefined : value;
}
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
    const accepted: readonly string[] = typeof hash === "string" ? [hash] : hash;
    if (matches.length !== 1 || !accepted.includes(createHash("sha256").update(matches[0].definition).digest("hex"))) {
      return { valid: false as const, reason: `reviewed_source_changed:${source}` };
    }
  }
  return { valid: true as const, projectionPositionColumn: "pozisyon", bindings: {
    ...REVIEWED_CFO_SOURCE_BINDINGS,
    // toplam = tarife + ek_maliyet (measured Trendyol ISLEM_BEDELI, docs/KARGO-TARIFE.md) → contract's constant processing fee is skipped.
    cfo_kargo_tarife: { min_try: "alt_sinir", max_try: "ust_sinir", kargo_try: "toplam", channel: "pazaryeri", effective_from: "gecerli_tarih" },
    // The component table has no set_sku relation. Never alias model/grup into it; the set's own cost comes from cfo_set_fiyat.
  }, shipping: {
    processingInShipping: true,
    // Bands were measured on 19.06–02.09.2026 Trendyol invoice lines and recorded with gecerli_tarih 2026-09-09 (decision 2026-10-06).
    effectiveRemap: { "2026-09-09": "2026-06-19" } as Readonly<Record<string, string>>,
  } };
}
