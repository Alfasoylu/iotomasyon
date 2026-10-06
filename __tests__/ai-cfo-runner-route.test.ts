import assert from "node:assert/strict";
import { runnerRequestGuard, RUNNER_BODY_LIMIT } from "../lib/cfo-agent/runner-request";

// POST /api/admin/ai-cfo/runner gate (the route calls exactly this function). Unauthenticated paths are also exercised
// against the real build in scripts/check-cfo-acceptance-route.mjs.
const url = "https://app.example.test/api/admin/ai-cfo/runner";
const ok = { authorized: true, origin: "https://app.example.test", url, vercelEnv: "production", declaredLength: 20, body: '{"action":"monitor"}' };
const err = (r: ReturnType<typeof runnerRequestGuard>) => r.ok ? "ok" : `${r.status}:${r.error}`;

assert.deepEqual(runnerRequestGuard(ok), { ok: true, action: "monitor" });
assert.deepEqual(runnerRequestGuard({ ...ok, body: '{"action":"morning"}' }), { ok: true, action: "morning" });
assert.deepEqual(runnerRequestGuard({ ...ok, vercelEnv: undefined }), { ok: true, action: "monitor" }, "local development (no VERCEL_ENV) is allowed");
// authorization is checked first: an unauthorized caller learns nothing else about the request
assert.equal(err(runnerRequestGuard({ ...ok, authorized: false, origin: null, vercelEnv: "preview", body: "{" })), "401:unauthorized");
// cross-site request forgery: missing or foreign origin
assert.equal(err(runnerRequestGuard({ ...ok, origin: null })), "403:origin_invalid");
assert.equal(err(runnerRequestGuard({ ...ok, origin: "https://evil.example" })), "403:origin_invalid");
assert.equal(err(runnerRequestGuard({ ...ok, origin: "http://app.example.test" })), "403:origin_invalid");
// preview/development deployments cannot write run records
assert.equal(err(runnerRequestGuard({ ...ok, vercelEnv: "preview" })), "403:production_only");
assert.equal(err(runnerRequestGuard({ ...ok, vercelEnv: "development" })), "403:production_only");
// size: declared or actual (multi-byte counted as bytes)
assert.equal(err(runnerRequestGuard({ ...ok, declaredLength: RUNNER_BODY_LIMIT + 1 })), "413:body_too_large");
assert.equal(err(runnerRequestGuard({ ...ok, declaredLength: 0, body: JSON.stringify({ action: "monitor", pad: "ş".repeat(600) }) })), "413:body_too_large");
// strict schema: unknown action, extra keys, wrong type, malformed JSON
for (const body of ['{"action":"delete"}', '{"action":"monitor","force":true}', '{"action":1}', "[]", "null", "", "{"])
  assert.equal(err(runnerRequestGuard({ ...ok, body })), "400:invalid_request", body);
console.log("AI CFO runner route gate: auth first, same-origin, production-only, byte limit, strict action schema passed");
