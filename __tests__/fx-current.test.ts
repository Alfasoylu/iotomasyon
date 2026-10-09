/**
 * Tek kur kaynağı (2026-10-07): lib/fx/pick.ts. USD/TRY → cfo_kur → cfo_settings → elle (MonthlyExchangeRate) → varsayılan;
 * RMB/USD → YALNIZ elle (MonthlyExchangeRate, RMB'si dolu en yeni ay); yoksa null "bilinmiyor" — cfo_settings ve sabit yedek yok
 * (2026-10-10, Alperen: "RMB/USD tek kaynağa bağlanmalı; bilinmeyende hard-coded fallback kullanılmamalı").
 * Çalıştır: node --import tsx __tests__/fx-current.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { pickCurrentFx } from "../lib/fx/pick";

const D = { usdTry: 45 };
// Üretim 07.10: cfo_kur 2026-10 = 48,98 · cfo_settings 48,98 / 7 · elle 2026-06 = 46 / 6,8
const prod = pickCurrentFx({ kur: { month: "2026-10", usdTry: 48.98 }, settings: { usdTry: 48.98 },
  manual: [{ month: "2026-06", usdTry: 46, rmbPerUsd: 6.8 }, { month: "2026-05", usdTry: 46, rmbPerUsd: 6.8 }] }, D);
assert.deepEqual(prod, { usdTry: 48.98, rmbPerUsd: 6.8, usdTrySource: "cfo_kur 2026-10", rmbSource: "elle 2026-06", usdTryMonth: "2026-10" });

// cfo_kur boş → cfo_settings; o da yoksa elle girilen en yeni; hiçbiri yoksa varsayılan
const settingsOnly = pickCurrentFx({ kur: null, settings: { usdTry: 47.5 }, manual: [] }, D);
assert.deepEqual([settingsOnly.usdTrySource, settingsOnly.rmbPerUsd, settingsOnly.rmbSource], ["cfo_settings", null, "bilinmiyor"], "RMB için cfo_settings yedeği yok");
const manualOnly = pickCurrentFx({ kur: null, settings: null, manual: [{ month: "2026-06", usdTry: 46, rmbPerUsd: null }, { month: "2026-05", usdTry: 45, rmbPerUsd: 6.9 }] }, D);
assert.deepEqual([manualOnly.usdTry, manualOnly.usdTrySource, manualOnly.rmbPerUsd, manualOnly.rmbSource], [46, "elle 2026-06", 6.9, "elle 2026-05"], "RMB boşsa bir önceki ay");
assert.deepEqual(pickCurrentFx({ kur: null, settings: null, manual: [] }, D), { usdTry: 45, rmbPerUsd: null, usdTrySource: "varsayılan", rmbSource: "bilinmiyor", usdTryMonth: null },
  "RMB bilinmiyorsa null — 7,2 / 7,0 gibi sabit yedek yok");
// sıfır / NaN kur geçersiz sayılır
assert.equal(pickCurrentFx({ kur: { month: "2026-10", usdTry: 0 }, settings: { usdTry: NaN }, manual: [] }, D).usdTrySource, "varsayılan");
assert.equal(pickCurrentFx({ kur: null, settings: null, manual: [{ month: "2026-10", usdTry: 48.98, rmbPerUsd: 0 }] }, D).rmbPerUsd, null, "0 RMB kuru geçersiz");
// Alperen kuralı 2026-10: RMB/USD 6,7 — en yeni ay 6,8'i geçersiz kılar
assert.deepEqual([pickCurrentFx({ kur: null, settings: null, manual: [{ month: "2026-10", usdTry: 48.98, rmbPerUsd: 6.7 }, { month: "2026-06", usdTry: 46, rmbPerUsd: 6.8 }] }, D).rmbPerUsd], [6.7]);

// Kodda RMB/USD sabit yedeği kalmasın (CFO maliyeti ve görünümler aynı kaynaktan)
const fallbacks = execSync(`grep -rnE "DEFAULT_RMB_USD_RATE|rmbPerUsd \\?\\? [0-9]|rmbUsdRate: [0-9]+\\.[0-9]" app lib services components || true`, { encoding: "utf8" }).trim();
assert.equal(fallbacks, "", `RMB/USD sabit yedeği: ${fallbacks}`);

// Uygulama kodu MonthlyExchangeRate'i yalnız kur yönetim sayfası/aksiyonu ve tek kaynak üzerinden okur
const readers = execSync(`grep -rlE "monthlyExchangeRate\\.(findFirst|findMany|findUnique)" app lib services components || true`, { encoding: "utf8" }).split("\n").filter(Boolean).sort();
assert.deepEqual(readers, ["app/(app)/admin/exchange-rates/page.tsx", "lib/actions/exchange-rate-actions.ts", "lib/fx/current.ts"], "yeni doğrudan kur okuyucu eklenmesin");
assert.match(readFileSync("lib/fx/current.ts", "utf8"), /from cfo_kur/);
console.log("FX current: cfo_kur first, fallbacks ordered, invalid rates ignored, single reader enforced");
