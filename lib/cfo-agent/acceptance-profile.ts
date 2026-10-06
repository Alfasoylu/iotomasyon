import { createHash } from "node:crypto";
import type { Row } from "./sources";

// Catalog definitions reviewed against the CFO's corrected-grain contract.
// A changed view invalidates this diagnostic profile, never its reference values.
export const REVIEWED_CFO_VIEW_HASHES: Readonly<Record<string, string>> = Object.freeze({
  cfo_satis_birim_duz: "092f4e05dae9f5a10bdf1c342272d2c3b8e5211057f7fa178905b2767dba065c",
  cfo_satis_siparis: "dbe129d7f551a7447387636eddd91a456b068739f4e5e0d64caf1dfac2ef006a",
});

export const REVIEWED_CFO_SOURCE_BINDINGS = {
  cfo_satis_siparis: { orderDate: "siparis_tarihi", totalAmountTry: "siparis_tutari" },
  cfo_nakit_kapisi: { amac_kmh: "amacli_kmh_try" },
  // maliyet: the set SKU's own computed cost (gross, KDV dahil), decision 2026-10-06 — no component recipe exists.
  cfo_set_fiyat: { birim_kar_try: "kar", set_maliyet_try: "maliyet" },
};

export function assertReviewedCfoDefinitions(definitions: Row[], expected = REVIEWED_CFO_VIEW_HASHES) {
  for (const [source, hash] of Object.entries(expected)) {
    const matches = definitions.filter(row => row.source === source);
    if (matches.length !== 1 || typeof matches[0].definition !== "string"
      || createHash("sha256").update(matches[0].definition).digest("hex") !== hash) {
      throw new Error("reviewed_canonical_definition_changed");
    }
  }
}

export function cfoAcceptanceContext(env: Record<string, string | undefined>, now = new Date()) {
  const mode = env.AI_CFO_ACCEPTANCE_MODE ?? "reference";
  if (mode !== "reference" && mode !== "current_comparison") throw new Error("invalid_acceptance_mode");
  const asOf = mode === "current_comparison" ? now.toISOString() : env.AI_CFO_ACCEPTANCE_AS_OF;
  if (!asOf || !Number.isFinite(Date.parse(asOf)) || (mode === "reference" && !asOf.startsWith("2026-10-03T"))) {
    throw new Error("reference_as_of_required_2026_10_03");
  }
  const profile = env.AI_CFO_ACCEPTANCE_SOURCE_PROFILE;
  if (profile !== undefined && profile !== "alfas_2026_10_03") throw new Error("invalid_acceptance_source_profile");
  return { mode, asOf, profile, isCurrentComparison: mode === "current_comparison" };
}
