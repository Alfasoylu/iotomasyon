import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { randomBytes } from "node:crypto";

// Ephemeral, never printed: proves the AI CFO cron routes are fail-closed and, with flags off, return `disabled`
// without touching the database (DATABASE_URL points at a non-existent build-only database).
const cronSecret = randomBytes(24).toString("hex");

const url = "http://127.0.0.1:3199/api/admin/ai-cfo/acceptance";
for (const [environment, status, failure] of [
  ["preview", 401, "unauthorized"],
  ["production", 401, "unauthorized"],
]) {
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "3199"], {
    env: { ...process.env, VERCEL_ENV: environment, CRON_SECRET: cronSecret, AI_CFO_ENABLED: "false", AI_CFO_MONITOR_ENABLED: "false" },
    stdio: "ignore",
  });
  try {
    let response;
    for (let attempt = 0; attempt < 60; attempt++) {
      try { response = await fetch(url, { signal: AbortSignal.timeout(2000) }); break; }
      catch { if (server.exitCode !== null) throw new Error("acceptance_smoke_server_exited"); await delay(250); }
    }
    assert.ok(response, "server must start");
    assert.equal(response.status, status);
    assert.match(response.headers.get("cache-control") ?? "", /private.*no-store/);
    assert.ok((response.headers.get("vary") ?? "").split(",").some(value => value.trim().toLowerCase() === "cookie"));
    assert.deepEqual(await response.json(), { completed: false, failure });
    const context = await fetch("http://127.0.0.1:3199/api/admin/ai-cfo/context");
    assert.equal(context.status,401);
    assert.match(context.headers.get("cache-control") ?? "",/private.*no-store/);
    assert.equal((await fetch("http://127.0.0.1:3199/api/admin/ai-cfo/context",{method:"POST"})).status,405);
    const page=await fetch("http://127.0.0.1:3199/cfo/calisma-durumu",{redirect:"manual"});
    assert.equal(page.status,307);
    assert.ok(page.headers.get("location")?.includes("/login"));
    const cycle=await fetch('http://127.0.0.1:3199/api/admin/ai-cfo/cycle');
    assert.equal(cycle.status,401);assert.match(cycle.headers.get('cache-control')??'',/private.*no-store/);
    assert.equal((await fetch('http://127.0.0.1:3199/api/admin/ai-cfo/cycle',{method:'POST',body:'{}'})).status,401);
    const worker=await fetch('http://127.0.0.1:3199/cfo/calisan',{redirect:'manual'});assert.equal(worker.status,307);
    assert.equal((await fetch('http://127.0.0.1:3199/api/admin/ai-cfo/files/example')).status,401);
    const cron=await fetch('http://127.0.0.1:3199/api/cron/cfo-cycle');assert.ok([401,503].includes(cron.status));
    // 2026-10-08: sitede LLM yok — sabah özeti ucu kaldırıldı; yalnız deterministik motor ucu kalır.
    assert.equal((await fetch("http://127.0.0.1:3199/api/cron/ai-cfo-morning", { headers: { authorization: `Bearer ${cronSecret}` } })).status, 404);
    for (const job of ["ai-cfo-monitor"]) {
      const jobUrl = `http://127.0.0.1:3199/api/cron/${job}`;
      assert.equal((await fetch(jobUrl)).status, 401);
      assert.equal((await fetch(jobUrl, { headers: { authorization: "Bearer wrong" } })).status, 401);
      const allowed = await fetch(jobUrl, { headers: { authorization: `Bearer ${cronSecret}` } });
      assert.equal(allowed.status, 200);
      assert.deepEqual(await allowed.json(), { status: "disabled" });
      assert.match(allowed.headers.get("cache-control") ?? "", /no-store/);
    }
    const runner = await fetch("http://127.0.0.1:3199/api/admin/ai-cfo/runner", { method: "POST", headers: { "content-type": "application/json", origin: "http://127.0.0.1:3199" }, body: '{"action":"engine"}' });
    assert.equal(runner.status, 401);
    assert.deepEqual(await runner.json(), { error: "unauthorized" });
    assert.match(runner.headers.get("cache-control") ?? "", /private.*no-store/);
    assert.equal((await fetch("http://127.0.0.1:3199/api/admin/ai-cfo/runner")).status, 405);
    const control = await fetch("http://127.0.0.1:3199/admin/ai-cfo", { redirect: "manual" });
    assert.ok([303, 307].includes(control.status), `admin/ai-cfo unauthenticated status ${control.status}`);
    assert.ok(control.headers.get("location")?.includes("/login"));
    const post = await fetch(url, { method: "POST" });
    assert.equal(post.status, 405);
    console.log(`CFO acceptance route: ${environment} access gate passed`);
  } finally {
    if (server.exitCode === null) { server.kill("SIGTERM"); await once(server, "exit"); }
  }
}
