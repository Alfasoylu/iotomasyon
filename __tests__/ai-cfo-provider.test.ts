/**
 * AI CFO V1 — Anthropic sağlayıcı katmanı (`lib/cfo-agent/provider.ts`).
 *
 * Gerçek ağ/API key GEREKMEZ: `fetch` enjekte edilip sahte Anthropic yanıtları
 * döndürülüyor (`createCfoProvider`in üçüncü parametresi). Amaç:
 * 1) istek şeklinin değişmediğini (model/max_tokens/output_config) kilitlemek,
 * 2) `reasoningPayload`ın veri sızıntısı FRENİNİ doğrulamak — yalnız
 *    anomaly.evidenceIds'te geçen evidence provider'a gider, geri kalanı asla,
 * 3) hata kodlarının (HTTP/timeout/geçersiz şema) doğru eşlendiğini,
 * 4) stop_reason="max_tokens" kesilmiş yanıtın BOŞ metin sayıldığını —
 *    yarım JSON'u "insight" diye yutmak yanlış/uydurma bulgu üretirdi.
 *
 * Anthropic'in Messages API'sindeki `output_config`/`json_schema` alanı ve
 * `claude-sonnet-4-6` model kimliği 05.10.2026'da platform.claude.com'dan
 * doğrulandı (bkz. PR açıklaması) — bu dosya varsayım üzerine kurulmadı.
 *
 * Çalıştır: npx tsx __tests__/ai-cfo-provider.test.ts
 */
import assert from "node:assert/strict";
import { createCfoProvider, ProviderError, reasoningPayload, type ReasoningInput } from "../lib/cfo-agent/provider";
import { getCfoConfig } from "../lib/cfo-agent/config";
import { metric, unknown } from "../lib/cfo-agent/calculations";
import type { Anomaly, CfoAgentSnapshot } from "../lib/cfo-agent/types";

let failed = 0;
function check(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => console.log(`  OK   ${name}`))
    .catch((e) => {
      failed++;
      console.error(`  FAIL ${name}\n         ${e instanceof Error ? e.stack ?? e.message : e}`);
    });
}

const zero = metric(0);
function snapshot(overrides: Partial<CfoAgentSnapshot> = {}): CfoAgentSnapshot {
  return {
    schemaVersion: "2", calculationVersion: "alfas-gross-v4", generatedAt: "2026-10-05T10:00:00Z",
    timezone: "Europe/Istanbul", currency: "TRY", accountingBasis: "gross_incl_vat",
    dataQuality: { staleSources: [], missingFields: [], costCoveragePct: 100, matchingCoveragePct: 100,
      sourceWatermarks: [], excludedDummyStock: 0, zeroStockSkuCount: 0, commissionCoverage: [],
      fbaInventoryUnknown: true, duplicateCanonicalRows: 0, excludedUntrustedRows: 0 },
    sales: { lastHour: { grossRevenue: zero, orders: 0, aov: zero, complete: true },
      today: { grossRevenue: zero, orders: 0, aov: zero, complete: true },
      yesterday: { grossRevenue: metric(1000), orders: 5, aov: zero, complete: true },
      last7Days: { grossRevenue: metric(7000), orders: 35, aov: zero, complete: true },
      last30Days: { grossRevenue: zero, orders: 0, aov: zero, complete: true },
      monthToDate: { grossRevenue: metric(20000), orders: 100, aov: zero, complete: true }, comparisons: [] },
    profitability: { grossRevenue: zero, revenueExVat: zero, vat: zero, refunds: zero, productCost: zero,
      commission: zero, shipping: zero, advertising: zero, otherVariableCosts: zero,
      contributionProfit: metric(2000), contributionMargin: metric(20) },
    profitabilityByPeriod: {}, channels: [],
    inventory: { costValue: zero, knownCostValue: zero, retailValue: zero, stockoutRiskValue: zero, deadStockValue: zero },
    products: [], deadStock: [],
    cash: { generalUnusedOverdraft: zero, totalCardDebt: zero, activeCards: 0, cash: metric(500000),
      minimumProjectedPosition: zero, purposeLimit: zero, banksFresh: true, summaries: [] },
    procurement: { riskySkuCount: 0, openOrders: 0 },
    importPipeline: { inboundSkuCount: 0, coveragePct: zero },
    returns: { currentRate: unknown("no_sample"), previousRate: unknown("no_sample"), sample: 0, complete: false },
    evidence: [
      { id: "e_kept_1", source: "s", query: "q1", value: 1, unit: "TRY", asOf: "2026-10-05T10:00:00Z", measured: true },
      { id: "e_kept_2", source: "s", query: "q2", value: 2, unit: "TRY", asOf: "2026-10-05T10:00:00Z", measured: true },
      { id: "e_dropped", source: "s", query: "q3", value: 3, unit: "TRY", asOf: "2026-10-05T10:00:00Z", measured: true },
    ],
    ...overrides,
  };
}
function anomaly(overrides: Partial<Anomaly> = {}): Anomaly {
  return { id: "a_1", rule: "STOCKOUT", severity: "warning", category: "inventory", entityType: "sku",
    entityId: "TRENDYOL:SKU-1", period: "2026-10", fingerprint: "f", cooldownKey: "c",
    evidenceIds: ["e_kept_1", "e_kept_2"], actionable: true, impact: null, weight: 0, existingRecordIds: [],
    ...overrides };
}

function okResponse(body: unknown) { return { ok: true, status: 200, json: async () => body } as Response; }
function errResponse(status: number) { return { ok: false, status, json: async () => ({}) } as Response; }

async function main() {
  console.log("\nAI CFO V1 — sağlayıcı (provider.ts) testleri\n");

  await check("provider yoksa (AI_CFO_PROVIDER=disabled) null döner", () => {
    const config = getCfoConfig({ AI_CFO_PROVIDER: "disabled" });
    const provider = createCfoProvider(config, { ANTHROPIC_API_KEY: "sk-test" }, async () => okResponse({}));
    assert.equal(provider, null);
  });

  await check("ANTHROPIC_API_KEY yoksa null döner (provider=anthropic olsa bile)", () => {
    const config = getCfoConfig({ AI_CFO_PROVIDER: "anthropic" });
    const provider = createCfoProvider(config, {}, async () => okResponse({}));
    assert.equal(provider, null);
  });

  await check("reasoningPayload yalnız anomaly.evidenceIds'te geçen evidence'ı taşır", () => {
    const input: ReasoningInput = { snapshot: snapshot(), anomalies: [anomaly()], memory: [] };
    const payload = reasoningPayload(input);
    const ids = payload.evidence.map((e) => e.id).sort();
    assert.deepEqual(ids, ["e_kept_1", "e_kept_2"]);
  });

  await check("reasoningPayload anomalies'i 8'e, memory'yi 5'e, missingFields'i 15'e kırpar", () => {
    const manyAnomalies = Array.from({ length: 12 }, (_, i) => anomaly({ id: `a_${i}`, evidenceIds: [] }));
    const manyMemory = Array.from({ length: 9 }, (_, i) => ({ source: "s", entityId: `e${i}`, text: "t", asOf: "2026-10-05" }));
    const manyMissing = Array.from({ length: 20 }, (_, i) => `missing_${i}`);
    const input: ReasoningInput = {
      snapshot: snapshot({ dataQuality: { ...snapshot().dataQuality, missingFields: manyMissing } }),
      anomalies: manyAnomalies, memory: manyMemory,
    };
    const payload = reasoningPayload(input);
    assert.equal(payload.anomalies.length, 8);
    assert.equal(payload.memory.length, 5);
    assert.equal(payload.dataQuality.missingFields.length, 15);
  });

  await check("istek şekli: model/max_tokens/output_config.json_schema doğru gönderilir", async () => {
    const config = getCfoConfig({ AI_CFO_PROVIDER: "anthropic", AI_CFO_MODEL: "claude-sonnet-4-6", AI_CFO_MAX_OUTPUT_TOKENS: "600" });
    let captured: { url: string; body: unknown } | null = null;
    const provider = createCfoProvider(config, { ANTHROPIC_API_KEY: "sk-test" }, async (url, init) => {
      captured = { url: String(url), body: JSON.parse(String((init as RequestInit).body)) };
      return okResponse({ id: "msg_1", stop_reason: "end_turn", content: [{ type: "text", text: '{"insights":[]}' }],
        usage: { input_tokens: 500, output_tokens: 20 } });
    });
    await provider!.generate({ snapshot: snapshot(), anomalies: [anomaly()], memory: [] });
    assert(captured !== null);
    const req = captured as unknown as { url: string; body: { model: string; max_tokens: number; output_config: { format: { type: string } } } };
    assert.equal(req.url, "https://api.anthropic.com/v1/messages");
    assert.equal(req.body.model, "claude-sonnet-4-6");
    assert.equal(req.body.max_tokens, 600);
    assert.equal(req.body.output_config.format.type, "json_schema");
    // Structured outputs bu kısıtları 400 ile reddeder (üretimde provider_http_400).
    const schemaText = JSON.stringify((req.body.output_config.format as unknown as { schema: unknown }).schema);
    for (const k of ["maxItems", "minLength", "maxLength", "minimum", "maximum", "multipleOf"]) assert.ok(!schemaText.includes(`"${k}"`), k);
    assert.ok(!/"minItems":(?![01][,}])/.test(schemaText), "minItems yalnız 0/1");
  });

  await check("generate: geçerli yanıt doğru ayrıştırılır (token/cache/requestId dahil)", async () => {
    const config = getCfoConfig({ AI_CFO_PROVIDER: "anthropic" });
    const provider = createCfoProvider(config, { ANTHROPIC_API_KEY: "sk-test" }, async () => okResponse({
      id: "msg_42", stop_reason: "end_turn", content: [{ type: "text", text: '{"insights":[]}' }],
      usage: { input_tokens: 1200, output_tokens: 80, cache_read_input_tokens: 300, cache_creation_input_tokens: 0 },
    }));
    const result = await provider!.generate({ snapshot: snapshot(), anomalies: [anomaly()], memory: [] });
    assert.equal(result.text, '{"insights":[]}');
    assert.equal(result.inputTokens, 1200);
    assert.equal(result.outputTokens, 80);
    assert.equal(result.cacheReadTokens, 300);
    assert.equal(result.requestId, "msg_42");
  });

  await check("generate: stop_reason=max_tokens iken metin BOŞ sayılır (kesik JSON güvenilmez)", async () => {
    const config = getCfoConfig({ AI_CFO_PROVIDER: "anthropic" });
    const provider = createCfoProvider(config, { ANTHROPIC_API_KEY: "sk-test" }, async () => okResponse({
      id: "msg_43", stop_reason: "max_tokens", content: [{ type: "text", text: '{"insights":[{"anomalyId"' }],
      usage: { input_tokens: 100, output_tokens: 600 },
    }));
    const result = await provider!.generate({ snapshot: snapshot(), anomalies: [anomaly()], memory: [] });
    assert.equal(result.text, "");
  });

  await check("generate: HTTP hata kodu provider_http_<status> fırlatır", async () => {
    const config = getCfoConfig({ AI_CFO_PROVIDER: "anthropic" });
    const provider = createCfoProvider(config, { ANTHROPIC_API_KEY: "sk-test" }, async () => errResponse(529));
    await assert.rejects(
      provider!.generate({ snapshot: snapshot(), anomalies: [anomaly()], memory: [] }),
      (e: unknown) => e instanceof ProviderError && e.code === "provider_http_529",
    );
  });

  await check("generate: zaman aşımı provider_timeout fırlatır", async () => {
    const config = getCfoConfig({ AI_CFO_PROVIDER: "anthropic" });
    const provider = createCfoProvider(config, { ANTHROPIC_API_KEY: "sk-test" }, async () => {
      const e = new Error("aborted"); e.name = "TimeoutError"; throw e;
    });
    await assert.rejects(
      provider!.generate({ snapshot: snapshot(), anomalies: [anomaly()], memory: [] }),
      (e: unknown) => e instanceof ProviderError && e.code === "provider_timeout",
    );
  });

  await check("generate: şemaya uymayan yanıt provider_invalid_response fırlatır", async () => {
    const config = getCfoConfig({ AI_CFO_PROVIDER: "anthropic" });
    const provider = createCfoProvider(config, { ANTHROPIC_API_KEY: "sk-test" }, async () => okResponse({ garbage: true }));
    await assert.rejects(
      provider!.generate({ snapshot: snapshot(), anomalies: [anomaly()], memory: [] }),
      (e: unknown) => e instanceof ProviderError && e.code === "provider_invalid_response",
    );
  });

  await check("countInput: geçerli yanıttan input_tokens okunur", async () => {
    const config = getCfoConfig({ AI_CFO_PROVIDER: "anthropic" });
    const provider = createCfoProvider(config, { ANTHROPIC_API_KEY: "sk-test" }, async () => okResponse({ input_tokens: 2048 }));
    const tokens = await provider!.countInput({ snapshot: snapshot(), anomalies: [anomaly()], memory: [] });
    assert.equal(tokens, 2048);
  });

  await check("countInput: geçersiz yanıt provider_invalid_token_count fırlatır", async () => {
    const config = getCfoConfig({ AI_CFO_PROVIDER: "anthropic" });
    const provider = createCfoProvider(config, { ANTHROPIC_API_KEY: "sk-test" }, async () => okResponse({}));
    await assert.rejects(
      provider!.countInput({ snapshot: snapshot(), anomalies: [anomaly()], memory: [] }),
      (e: unknown) => e instanceof ProviderError && e.code === "provider_invalid_token_count",
    );
  });

  console.log(failed ? `\n${failed} test BAŞARISIZ.\n` : "\nTüm testler geçti.\n");
  if (failed) process.exit(1);
}

main();
