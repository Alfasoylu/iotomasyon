import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";

const url = "http://127.0.0.1:3199/api/admin/ai-cfo/acceptance";
for (const [environment, status, failure] of [
  ["preview", 401, "unauthorized"],
  ["production", 404, "preview_only"],
]) {
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "3199"], {
    env: { ...process.env, VERCEL_ENV: environment },
    stdio: "ignore",
  });
  try {
    let response;
    for (let attempt = 0; attempt < 60; attempt++) {
      try { response = await fetch(url, { signal: AbortSignal.timeout(2000) }); break; }
      catch { if (server.exitCode !== null) throw new Error("preview_smoke_server_exited"); await delay(250); }
    }
    assert.ok(response, "server must start");
    assert.equal(response.status, status);
    assert.match(response.headers.get("cache-control") ?? "", /private.*no-store/);
    assert.equal(response.headers.get("vary"), "Cookie");
    assert.deepEqual(await response.json(), { completed: false, failure });
    const post = await fetch(url, { method: "POST" });
    assert.equal(post.status, 405);
    console.log(`CFO acceptance route: ${environment} access gate passed`);
  } finally {
    if (server.exitCode === null) { server.kill("SIGTERM"); await once(server, "exit"); }
  }
}
