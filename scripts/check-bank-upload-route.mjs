import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { randomBytes } from "node:crypto";

const base = "http://127.0.0.1:3198";
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "3198"], {
  env: { ...process.env, SESSION_SECRET: randomBytes(32).toString("hex") }, stdio: "ignore",
});
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try { await fetch(base, { signal: AbortSignal.timeout(2000) }); ready = true; break; }
    catch { if (server.exitCode !== null) throw new Error("bank_upload_server_exited"); await delay(250); }
  }
  assert(ready);
  for (const action of ["onizleme", "uygula", "bakiye"]) {
    const url = `${base}/api/admin/banka-yukleme/${action}`;
    const response = await fetch(url, { method: "POST" });
    assert.equal(response.status, 401, `${action} requires session before file parsing or database access`);
    assert.equal(typeof (await response.json()).error, "string");
    assert.equal((await fetch(url)).status, 405);
  }
  const review = await fetch(`${base}/api/admin/banka-yukleme/inceleme`);
  assert.equal(review.status, 401);
  assert.match(review.headers.get("cache-control") ?? "", /private.*no-store/);
  assert.match(review.headers.get("vary") ?? "", /Cookie/);
  assert.deepEqual(await review.json(), { completed: false, failure: "unauthorized" });
  assert.equal((await fetch(`${base}/api/admin/banka-yukleme/inceleme`, {method:"POST"})).status,405);
  const page = await fetch(`${base}/admin/banka-yukleme`, { redirect: "manual" });
  assert([303, 307].includes(page.status));
  assert.match(page.headers.get("location") ?? "", /\/login/);
  console.log("Bank upload: page login and all three API access gates passed");
} finally {
  if (server.exitCode === null) { server.kill("SIGTERM"); await once(server, "exit"); }
}
