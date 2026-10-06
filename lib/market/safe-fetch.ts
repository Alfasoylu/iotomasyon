import https from "node:https";
import dns from "node:dns";
import net from "node:net";
import zlib from "node:zlib";

// Allowlisted outbound fetch for Market Scout (SSRF-hardened). Rules:
//   https only, port 443 only · hostname must be on the caller's allowlist (exact match) · every resolved IP is checked AT CONNECT TIME
//   (custom lookup → no DNS-rebinding window) and private/loopback/link-local/CGNAT/multicast/reserved ranges are refused ·
//   redirects are followed manually (max 3) and each hop is re-validated · timeout · decompressed size cap · optional content-type allowlist.
// The response body is untrusted DATA. Nothing fetched here is ever used as an instruction.

export const MARKET_FETCH_HOSTS = {
  trendyolSitemap: ["www.trendyol.com"],
  trendyolApi: ["apigw.trendyol.com"],
  trendyolImages: ["cdn.dsmcdn.com"],
} as const;

export class SafeFetchError extends Error {
  constructor(public readonly code: string, message?: string) { super(message ?? code); this.name = "SafeFetchError"; }
}
export interface SafeFetchOptions {
  allowedHosts: readonly string[];
  method?: "GET" | "HEAD" | "POST";
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  maxBytes?: number;
  allowedContentTypes?: readonly string[];
  maxRedirects?: number;
  /** test seam: DNS lookup returning all addresses */
  resolve?: (host: string) => Promise<{ address: string; family: number }[]>;
  /** test seam: replaces the network hop (URL validation, redirect and content-type rules still apply) */
  transport?: (u: URL, o: SafeFetchOptions) => Promise<{ status: number; headers: Record<string, string>; body: Buffer }>;
}
export interface SafeFetchResult { status: number; headers: Record<string, string>; body: Buffer; finalUrl: string }

const V4_BLOCKED: [string, number][] = [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4]];
const v4ToInt = (ip: string) => ip.split(".").reduce((a, o) => (a << 8) + Number(o), 0) >>> 0;
export function isBlockedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const x = v4ToInt(ip);
    return V4_BLOCKED.some(([base, bits]) => ((x ^ v4ToInt(base)) >>> (32 - bits)) === 0);
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isBlockedIp(mapped[1]);
    if (lower === "::" || lower === "::1") return true;
    const first = parseInt(lower.split(":")[0] || "0", 16);
    return (first & 0xfe00) === 0xfc00 /* ULA fc00::/7 */ || (first & 0xffc0) === 0xfe80 /* link-local */ || (first & 0xff00) === 0xff00 /* multicast */
      || lower.startsWith("64:ff9b:") || lower.startsWith("2001:db8:") || lower.startsWith("100::");
  }
  return true;
}

export function validateUrl(raw: string, allowedHosts: readonly string[]): URL {
  let u: URL;
  try { u = new URL(raw); } catch { throw new SafeFetchError("invalid_url"); }
  if (u.protocol !== "https:") throw new SafeFetchError("https_only");
  if (u.username || u.password) throw new SafeFetchError("credentials_in_url");
  if (u.port && u.port !== "443") throw new SafeFetchError("port_not_allowed");
  const host = u.hostname.toLowerCase();
  if (net.isIP(host.replace(/^\[|\]$/g, ""))) throw new SafeFetchError("ip_literal_not_allowed");
  if (!allowedHosts.includes(host)) throw new SafeFetchError("host_not_allowed", host);
  return u;
}

const defaultResolve = (host: string) => dns.promises.lookup(host, { all: true, verbatim: true });

/** Reads a stream up to maxBytes; rejects with response_too_large beyond it. */
export function readLimited(stream: NodeJS.ReadableStream, maxBytes: number, onAbort?: () => void): Promise<Buffer> {
  return new Promise((ok, fail) => {
    const chunks: Buffer[] = []; let size = 0, done = false;
    stream.on("data", (c: Buffer) => {
      if (done) return;
      size += c.length;
      if (size > maxBytes) { done = true; onAbort?.(); fail(new SafeFetchError("response_too_large")); return; }
      chunks.push(c);
    });
    stream.on("end", () => { if (!done) { done = true; ok(Buffer.concat(chunks)); } });
    stream.on("error", e => { if (!done) { done = true; fail(e instanceof SafeFetchError ? e : new SafeFetchError("decode_failed", String(e))); } });
  });
}

function requestOnce(u: URL, o: SafeFetchOptions): Promise<{ status: number; headers: Record<string, string>; body: Buffer }> {
  const resolve = o.resolve ?? defaultResolve, maxBytes = o.maxBytes ?? 5_000_000;
  return new Promise((ok, fail) => {
    const req = https.request({
      protocol: "https:", hostname: u.hostname, port: 443, path: `${u.pathname}${u.search}`, method: o.method ?? "GET", servername: u.hostname,
      headers: { "accept-encoding": "gzip", ...(o.headers ?? {}) },
      // connect-time validation of EVERY resolved address (prevents DNS rebinding between check and connect)
      lookup: ((hostname: string, opts: { all?: boolean }, cb: (...a: unknown[]) => void) => {
        resolve(hostname).then(addrs => {
          if (!addrs.length) return cb(new SafeFetchError("dns_empty"));
          const bad = addrs.find(a => isBlockedIp(a.address));
          if (bad) return cb(new SafeFetchError("blocked_ip", bad.address));
          if (opts?.all) return cb(null, addrs.map(a => ({ address: a.address, family: a.family })));
          cb(null, addrs[0].address, addrs[0].family);
        }, e => cb(e));
      }) as unknown as https.RequestOptions["lookup"],
    }, res => {
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(res.headers)) if (v != null) headers[k.toLowerCase()] = Array.isArray(v) ? v.join(", ") : String(v);
      const enc = (headers["content-encoding"] ?? "").toLowerCase();
      const stream = enc === "gzip" ? res.pipe(zlib.createGunzip()) : res;
      readLimited(stream, maxBytes, () => { req.destroy(); res.destroy(); }).then(body => ok({ status: res.statusCode ?? 0, headers, body }), fail);
    });
    req.setTimeout(o.timeoutMs ?? 15_000, () => { req.destroy(new SafeFetchError("timeout")); });
    req.on("error", e => fail(e instanceof SafeFetchError ? e : new SafeFetchError("network_error", (e as Error).message)));
    if (o.body) req.write(o.body);
    req.end();
  });
}

export async function safeFetch(rawUrl: string, o: SafeFetchOptions): Promise<SafeFetchResult> {
  let u = validateUrl(rawUrl, o.allowedHosts);
  for (let hop = 0; ; hop++) {
    const r = await (o.transport ?? requestOnce)(u, o);
    if (r.status >= 300 && r.status < 400 && r.headers.location) {
      if (hop >= (o.maxRedirects ?? 3)) throw new SafeFetchError("too_many_redirects");
      u = validateUrl(new URL(r.headers.location, u).toString(), o.allowedHosts); // every hop re-validated
      continue;
    }
    if (o.allowedContentTypes && r.status >= 200 && r.status < 300) {
      const ct = (r.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
      if (!o.allowedContentTypes.includes(ct)) throw new SafeFetchError("content_type_not_allowed", ct);
    }
    return { ...r, finalUrl: u.toString() };
  }
}
