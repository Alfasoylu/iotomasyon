/**
 * Tek kur kaynağı (2026-10-07): lib/fx/pick.ts. USD/TRY → cfo_kur → cfo_settings → elle (MonthlyExchangeRate) → varsayılan;
 * RMB/USD → elle → cfo_settings → varsayılan. Çalıştır: node --import tsx __tests__/fx-current.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { pickCurrentFx } from "../lib/fx/pick";

const D = { usdTry: 45, rmbPerUsd: 7.2 };
// Üretim 07.10: cfo_kur 2026-10 = 48,98 · cfo_settings 48,98 / 7 · elle 2026-06 = 46 / 6,8
const prod = pickCurrentFx({ kur: { month: "2026-10", usdTry: 48.98 }, settings: { usdTry: 48.98, rmbPerUsd: 7 },
  manual: [{ month: "2026-06", usdTry: 46, rmbPerUsd: 6.8 }, { month: "2026-05", usdTry: 46, rmbPerUsd: 6.8 }] }, D);
assert.deepEqual(prod, { usdTry: 48.98, rmbPerUsd: 6.8, usdTrySource: "cfo_kur 2026-10", rmbSource: "elle 2026-06", usdTryMonth: "2026-10" });

// cfo_kur boş → cfo_settings; o da yoksa elle girilen en yeni; hiçbiri yoksa varsayılan
assert.equal(pickCurrentFx({ kur: null, settings: { usdTry: 47.5, rmbPerUsd: 7 }, manual: [] }, D).usdTrySource, "cfo_settings");
const manualOnly = pickCurrentFx({ kur: null, settings: null, manual: [{ month: "2026-06", usdTry: 46, rmbPerUsd: null }, { month: "2026-05", usdTry: 45, rmbPerUsd: 6.9 }] }, D);
assert.deepEqual([manualOnly.usdTry, manualOnly.usdTrySource, manualOnly.rmbPerUsd, manualOnly.rmbSource], [46, "elle 2026-06", 6.9, "elle 2026-05"], "RMB boşsa bir önceki ay");
assert.deepEqual(pickCurrentFx({ kur: null, settings: null, manual: [] }, D), { ...D, usdTrySource: "varsayılan", rmbSource: "varsayılan", usdTryMonth: null });
// sıfır / NaN kur geçersiz sayılır
assert.equal(pickCurrentFx({ kur: { month: "2026-10", usdTry: 0 }, settings: { usdTry: NaN, rmbPerUsd: 0 }, manual: [] }, D).usdTrySource, "varsayılan");

// Uygulama kodu MonthlyExchangeRate'i yalnız kur yönetim sayfası/aksiyonu ve tek kaynak üzerinden okur
const readers = execSync(`grep -rlE "monthlyExchangeRate\\.(findFirst|findMany|findUnique)" app lib services components || true`, { encoding: "utf8" }).split("\n").filter(Boolean).sort();
assert.deepEqual(readers, ["app/(app)/admin/exchange-rates/page.tsx", "lib/actions/exchange-rate-actions.ts", "lib/fx/current.ts"], "yeni doğrudan kur okuyucu eklenmesin");
assert.match(readFileSync("lib/fx/current.ts", "utf8"), /from cfo_kur/);
console.log("FX current: cfo_kur first, fallbacks ordered, invalid rates ignored, single reader enforced");
