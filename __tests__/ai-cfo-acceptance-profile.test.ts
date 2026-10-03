import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { assertReviewedCfoDefinitions, cfoAcceptanceContext } from "../lib/cfo-agent/acceptance-profile";

const now = new Date("2026-10-03T17:00:00Z");
assert.throws(() => cfoAcceptanceContext({}, now), /reference_as_of_required/);
assert.throws(() => cfoAcceptanceContext({ AI_CFO_ACCEPTANCE_AS_OF: "2026-10-04T00:00:00Z" }, now), /reference_as_of_required/);
assert.equal(cfoAcceptanceContext({ AI_CFO_ACCEPTANCE_AS_OF: now.toISOString() }, now).isCurrentComparison, false);
const comparison = cfoAcceptanceContext({ AI_CFO_ACCEPTANCE_MODE: "current_comparison", AI_CFO_ACCEPTANCE_AS_OF: "2026-10-03T01:00:00Z" }, now);
assert.equal(comparison.isCurrentComparison, true);
assert.equal(comparison.asOf, now.toISOString());
assert.throws(() => cfoAcceptanceContext({ AI_CFO_ACCEPTANCE_MODE: "approve" }, now), /invalid_acceptance_mode/);
assert.throws(() => cfoAcceptanceContext({ AI_CFO_ACCEPTANCE_MODE: "current_comparison", AI_CFO_ACCEPTANCE_SOURCE_PROFILE: "guess" }, now), /invalid_acceptance_source_profile/);
console.log("PASS current comparison cannot masquerade as historical reference; reference date/profile/mode validated");

const definitions = [{ source: "cfo_satis_birim_duz", definition: "select corrected_quantity as adet_duz, corrected_gross as tutar_duz from fixture" },
  { source: "cfo_satis_siparis", definition: "select channel, order_number, sum(gross) from fixture group by channel, order_number" }];
const hashes = Object.fromEntries(definitions.map(row => [row.source, createHash("sha256").update(row.definition).digest("hex")]));
assertReviewedCfoDefinitions(definitions, hashes);
assert.throws(() => assertReviewedCfoDefinitions(definitions.slice(1), hashes), /reviewed_canonical_definition_changed/);
assert.throws(() => assertReviewedCfoDefinitions([...definitions, definitions[0]], hashes), /reviewed_canonical_definition_changed/);
assert.throws(() => assertReviewedCfoDefinitions([{ ...definitions[0], definition: "select raw_quantity, raw_total from fixture" }, definitions[1]], hashes), /reviewed_canonical_definition_changed/);
console.log("PASS missing/duplicate/changed canonical view invalidates reviewed profile before aggregation");
