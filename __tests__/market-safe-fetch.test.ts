import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { isBlockedIp, readLimited, safeFetch, SafeFetchError, validateUrl } from "../lib/market/safe-fetch";

// Outbound fetch hardening (SSRF): https only, exact host allowlist, no IP literals / credentials / odd ports, private-range IPs refused at
// connect time (DNS answer checked), redirects re-validated per hop, content-type allowlist, response size cap.
// Run with: node --import tsx __tests__/market-safe-fetch.test.ts
const H = ["www.trendyol.com"];
const code = async (p: Promise<unknown>) => { try { await p; return "ok"; } catch (e) { return e instanceof SafeFetchError ? e.code : `other:${(e as Error).message}`; } };

async function main() {
  // URL validation
  assert.equal(validateUrl("https://www.trendyol.com/sitemap_index.xml", H).hostname, "www.trendyol.com");
  for (const [u, c] of [["http://www.trendyol.com/x", "https_only"], ["https://evil.com/x", "host_not_allowed"], ["https://www.trendyol.com.evil.com/x", "host_not_allowed"],
    ["https://127.0.0.1/x", "ip_literal_not_allowed"], ["https://[::1]/x", "ip_literal_not_allowed"], ["https://user:pw@www.trendyol.com/x", "credentials_in_url"],
    ["https://www.trendyol.com:8443/x", "port_not_allowed"], ["file:///etc/passwd", "https_only"], ["not a url", "invalid_url"]] as const) {
    assert.throws(() => validateUrl(u, H), (e: unknown) => e instanceof SafeFetchError && e.code === c, u);
  }
  // private / reserved ranges
  for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "fc00::1", "fe80::1", "::ffff:10.0.0.1", "::"])
    assert.equal(isBlockedIp(ip), true, ip);
  for (const ip of ["104.18.1.1", "8.8.8.8", "172.32.0.1", "2606:4700::1111"]) assert.equal(isBlockedIp(ip), false, ip);

  // DNS answer pointing to a private address is refused at connect time (no request leaves the host)
  assert.equal(await code(safeFetch("https://www.trendyol.com/x", { allowedHosts: H, resolve: async () => [{ address: "169.254.169.254", family: 4 }] })), "blocked_ip");
  assert.equal(await code(safeFetch("https://www.trendyol.com/x", { allowedHosts: H, resolve: async () => [{ address: "104.18.1.1", family: 4 }, { address: "10.0.0.5", family: 4 }] })), "blocked_ip",
    "any private address in the answer refuses the request (rebinding-style mixed answers)");
  assert.equal(await code(safeFetch("https://www.trendyol.com/x", { allowedHosts: H, resolve: async () => [] })), "dns_empty");

  // redirects re-validated per hop; hop limit; content-type allowlist (transport seam replaces the network only)
  const t = (status: number, headers: Record<string, string>, body = "") => async () => ({ status, headers, body: Buffer.from(body) });
  assert.equal(await code(safeFetch("https://www.trendyol.com/a", { allowedHosts: H, transport: t(302, { location: "https://169.254.169.254/latest/meta-data" }) })), "ip_literal_not_allowed");
  assert.equal(await code(safeFetch("https://www.trendyol.com/a", { allowedHosts: H, transport: t(301, { location: "https://evil.com/" }) })), "host_not_allowed");
  assert.equal(await code(safeFetch("https://www.trendyol.com/a", { allowedHosts: H, transport: t(302, { location: "http://www.trendyol.com/b" }) })), "https_only");
  assert.equal(await code(safeFetch("https://www.trendyol.com/a", { allowedHosts: H, transport: t(302, { location: "/b" }) })), "too_many_redirects");
  let hops = 0;
  const r = await safeFetch("https://www.trendyol.com/a", { allowedHosts: H, transport: async (u): Promise<{ status: number; headers: Record<string, string>; body: Buffer }> => (hops++ === 0
    ? { status: 302, headers: { location: "/final" }, body: Buffer.alloc(0) }
    : { status: 200, headers: { "content-type": "text/xml; charset=utf-8" }, body: Buffer.from(`<ok>${u.pathname}</ok>`) }), allowedContentTypes: ["text/xml"] });
  assert.deepEqual([r.status, r.finalUrl, r.body.toString()], [200, "https://www.trendyol.com/final", "<ok>/final</ok>"]);
  assert.equal(await code(safeFetch("https://www.trendyol.com/a", { allowedHosts: H, transport: t(200, { "content-type": "text/html" }), allowedContentTypes: ["text/xml"] })), "content_type_not_allowed");

  // response size cap
  const big = Readable.from([Buffer.alloc(600), Buffer.alloc(600)]);
  assert.equal(await code(readLimited(big, 1000)), "response_too_large");
  assert.equal((await readLimited(Readable.from([Buffer.from("abc")]), 1000)).toString(), "abc");
  console.log("Market safe-fetch: https-only, host allowlist, IP literal / credential / port rejection, private ranges refused at connect, per-hop redirect validation, content-type and size limits — OK");
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
