import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { isAuthorized } from "./auth.ts";

// ALFAS CFO — Google erişim köprüsü (yalnız Search Console + Analytics OKUMA).
// Yetkilendirme: verify_jwt=false; çağıran `x-cfo-internal` başlığında cfo_secret.CFO_GOOGLE_INTERNAL_TOKEN değerini taşımalıdır
// (public.cfo_google() SECURITY DEFINER fonksiyonu ekler). Anon/authenticated JWT'si yetki sayılmaz.
// Servis hesabı anahtarı cfo_secret'te kalır; yanıtta hesap e-postası dahil hiçbir kimlik metadata'sı dönmez.

const SCOPES = [
  "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/analytics.readonly",
].join(" ");
const JSON_HEADERS = { "Content-Type": "application/json" };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

function b64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function pemToPkcs8(pem: string): Uint8Array {
  const body = pem.replace(/-----BEGIN PRIVATE KEY-----/, "").replace(/-----END PRIVATE KEY-----/, "").replace(/\s+/g, "");
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function getAccessToken(sa: Record<string, string>): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const claim = b64url(new TextEncoder().encode(JSON.stringify({ iss: sa.client_email, scope: SCOPES, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })));
  const signingInput = `${header}.${claim}`;
  const key = await crypto.subtle.importKey("pkcs8", pemToPkcs8(sa.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(signingInput));
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${signingInput}.${b64url(sig)}` }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error("token_error");
  return j.access_token as string;
}
async function gapi(token: string, url: string, body?: unknown) {
  const res = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${token}`, ...(body ? JSON_HEADERS : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, ok: res.ok, data: parsed };
}
async function secret(sbUrl: string, srk: string, key: string): Promise<string | null> {
  const res = await fetch(`${sbUrl}/rest/v1/cfo_secret?key=eq.${encodeURIComponent(key)}&select=value`, { headers: { apikey: srk, Authorization: `Bearer ${srk}` } });
  const rows = await res.json();
  return Array.isArray(rows) && rows.length > 0 && typeof rows[0].value === "string" ? rows[0].value : null;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return reply({ error: "unauthorized" }, 401);
  // Önce ucuz kontrol: başlık yoksa DB'ye gitmeden reddet.
  const provided = req.headers.get("x-cfo-internal");
  if (!provided) return reply({ error: "unauthorized" }, 401);
  try {
    const sbUrl = Deno.env.get("SUPABASE_URL")!;
    const srk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!isAuthorized(provided, await secret(sbUrl, srk, "CFO_GOOGLE_INTERNAL_TOKEN"))) return reply({ error: "unauthorized" }, 401);

    const payload = await req.json().catch(() => ({}));
    const action = payload.action ?? "list";
    const saJson = await secret(sbUrl, srk, "GOOGLE_SA_KEY_JSON");
    if (!saJson) return reply({ error: "not_configured" }, 404);
    const token = await getAccessToken(JSON.parse(saJson));
    const out: Record<string, unknown> = {};

    if (action === "list") {
      out.search_console = await gapi(token, "https://www.googleapis.com/webmasters/v3/sites");
      out.ga4_accounts = await gapi(token, "https://analyticsadmin.googleapis.com/v1beta/accountSummaries");
    } else if (action === "gsc_query") {
      if (typeof payload.siteUrl !== "string" || payload.siteUrl.length > 300) return reply({ error: "bad_request" }, 400);
      out.result = await gapi(token, `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(payload.siteUrl)}/searchAnalytics/query`, {
        startDate: payload.startDate, endDate: payload.endDate, dimensions: payload.dimensions ?? ["date"], rowLimit: payload.rowLimit ?? 100, type: payload.type ?? "web",
      });
    } else if (action === "ga4_report") {
      if (!/^\d{1,20}$/.test(String(payload.propertyId))) return reply({ error: "bad_request" }, 400);
      out.result = await gapi(token, `https://analyticsdata.googleapis.com/v1beta/properties/${payload.propertyId}:runReport`, payload.report);
    } else {
      return reply({ error: "bad_request" }, 400);
    }
    return reply(out);
  } catch {
    return reply({ error: "upstream_error" }, 502);
  }
});
