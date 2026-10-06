import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/page-header";
import { prismaDb, lastRuns } from "@/lib/market/store";
import { sourceHealth, type HealthStatus } from "@/lib/market/sources";
import { productHunter, type HunterCard } from "@/lib/market/hunter";
import { addWatchlistAction, createOpportunityAction, manualCaptureAction, manualSourcingAction, setWatchlistActiveAction,
  transitionOpportunityAction } from "@/lib/actions/market-scout-actions";
import { TRANSITIONS } from "@/lib/market/scoring";

// Market Scout (PR3 foundation) — DISCOVER → VERIFY → MEASURE → RECOMMEND. Read views + human-entered data only.
// No collector is scheduled; nothing here changes Forecast V2, orders or decisions. UNKNOWN is shown as UNKNOWN (never filled in).
export const dynamic = "force-dynamic";
const TABS = [["hunter", "Product Hunter"], ["watchlist", "Watchlist"], ["observations", "Pazar gözlemleri"], ["sourcing", "Tedarik adayları"], ["sources", "Veri kaynakları"]] as const;
type Tab = typeof TABS[number][0];
const U = "UNKNOWN";
const v = (x: unknown, d = 2) => x == null || x === "" ? U : typeof x === "number" || /^-?\d+(\.\d+)?$/.test(String(x)) ? Number(x).toLocaleString("tr-TR", { maximumFractionDigits: d }) : String(x);
const time = (x: string | null) => x ? new Date(x).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" }) : U;
const isDemo = (by: string | null | undefined) => !!by && by.startsWith("DEMO");
const HEALTH_VARIANT: Record<HealthStatus, "ok" | "warn" | "danger" | "neutral" | "info"> = { AVAILABLE: "ok", LIMITED: "warn", EXPERIMENTAL: "info",
  BLOCKED: "danger", UNAVAILABLE: "neutral", LEGAL_REVIEW_REQUIRED: "neutral" };
const KIND = (source: string | null) => source === "TRENDYOL_SITEMAP" || source === "TRENDYOL_OFFICIAL_API" ? "AUTOMATIC" : source?.startsWith("MANUAL") ? "MANUAL" : U;
const input = "w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] px-2 py-1.5 text-[13px]";

async function tablesInstalled() {
  try { return (await prisma.$queryRawUnsafe<{ ok: boolean }[]>(`select to_regclass('public.market_product_observation') is not null as ok`))[0]?.ok === true; }
  catch { return false; }
}
async function healthContext() {
  let trendyolConfigured = false;
  try {
    trendyolConfigured = (await prisma.$queryRawUnsafe<{ ok: boolean }[]>(`select bool_or("isEnabled" and coalesce("apiKey", '') <> '' and coalesce("apiSecret", '') <> ''
      and coalesce("supplierId", '') <> '') as ok from public."TrendyolConfig"`))[0]?.ok === true;
  } catch { /* table missing → unavailable */ }
  return { trendyolConfigured, buyboxStorefrontConfigured: /^[A-Z]{2}$/.test(process.env.MARKET_SCOUT_TRENDYOL_STOREFRONT_CODE ?? ""),
    googleTrendsConfigured: process.env.MARKET_SCOUT_GOOGLE_TRENDS_ACCESS === "granted", autocompleteEnabled: process.env.MARKET_SCOUT_AUTOCOMPLETE_ENABLED === "true" };
}

function Field({ name, label, type = "text", required = false, placeholder }: { name: string; label: string; type?: string; required?: boolean; placeholder?: string }) {
  return <label className="space-y-1 text-xs"><span className="text-[var(--text-muted)]">{label}{required ? " *" : ""}</span>
    <input name={name} type={type} required={required} placeholder={placeholder} step={type === "number" ? "any" : undefined} className={input} /></label>;
}

function HunterCardView({ c }: { c: HunterCard }) {
  const next = TRANSITIONS[c.state];
  return <Card className="space-y-2 p-4">
    <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{c.title}</h3><Badge>{c.state}</Badge>
      {c.legacy && <Badge variant="info">LEGACY</Badge>}<Badge variant={c.fit.grade === "B" ? "ok" : c.fit.grade === "UNKNOWN" ? "neutral" : "warn"}>Veri {c.fit.grade}</Badge></div>
    <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
      <dt className="text-[var(--text-muted)]">Neden şimdi</dt><dd>{c.whyNow.length ? c.whyNow.join(" · ") : U}</dd>
      <dt className="text-[var(--text-muted)]">Rakip kanıtı</dt><dd>{c.evidenceSnapshotIds.length} gözlem · rakip satış adedi: {U}</dd>
      <dt className="text-[var(--text-muted)]">Pazar momentumu</dt><dd>{c.momentum ? `${c.momentum.direction} (${c.momentum.points} gözlem, yorum hızı ${v(c.momentum.reviewVelocityPer7d, 1)}/7g, fiyat değişimi ${c.momentum.priceChangePct == null ? U : `${(c.momentum.priceChangePct * 100).toFixed(1)}%`})` : U}</dd>
      <dt className="text-[var(--text-muted)]">Google sinyali</dt><dd>{U} (Google Trends erişimi yok)</dd>
      <dt className="text-[var(--text-muted)]">Çin tedarik</dt><dd>{c.sourcing.count ? `${c.sourcing.count} manuel aday · görünen ${v(c.sourcing.best?.displayedPriceMin)}–${v(c.sourcing.best?.displayedPriceMax)} ${c.sourcing.best?.currency ?? ""} · MOQ ${v(c.sourcing.best?.moq, 0)}` : U} · iniş maliyeti: {c.sourcing.landedCost}</dd>
      <dt className="text-[var(--text-muted)]">Kategori uyumu</dt><dd>{c.fit.score}/100 puan · kapsama %{Math.round(c.fit.coverage * 100)}{c.fit.observedOnlyScore != null ? ` · mevcut bileşenlerde ${c.fit.observedOnlyScore}` : ""} · eksik: {c.fit.missing.join(", ") || "—"}</dd>
      <dt className="text-[var(--text-muted)]">Beklenen marj</dt><dd>{U}</dd>
      <dt className="text-[var(--text-muted)]">Sonraki adım</dt><dd className="font-medium">{c.assessment.nextAction}</dd>
      <dt className="text-[var(--text-muted)]">Sürüm / kanıt</dt><dd className="font-mono text-[11px]">{c.scoringVersion} · {c.firstObservedAt.slice(0, 10)} · {c.evidenceSnapshotIds.map(x => x.slice(0, 8)).join(", ") || "—"}</dd>
    </dl>
    {c.queries.length > 0 && <p className="text-xs"><span className="text-[var(--text-muted)]">GENERATED_QUERY (gözlem değil): </span>{c.queries.map(q => `[${q.language}] ${q.query}`).join(" · ")}</p>}
    <form action={transitionOpportunityAction} className="flex flex-wrap items-center gap-2 text-xs">
      <input type="hidden" name="id" value={c.id} />
      <select name="to" className={`${input} w-auto`}>{next.map(s => <option key={s} value={s}>{s}</option>)}</select>
      <input name="reason" required minLength={2} placeholder="gerekçe" className={`${input} w-56`} />
      <button className="rounded-md border px-2 py-1">Durum değiştir (insan)</button>
    </form>
  </Card>;
}

export default async function MarketScoutPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePermission(PERMISSIONS.MARKET_SCOUT_READ);
  const sp = await searchParams;
  const tab: Tab = (TABS.map(t => t[0]) as string[]).includes(sp.tab ?? "") ? sp.tab as Tab : "hunter";
  const installed = await tablesInstalled();
  const db = prismaDb(prisma);
  const runs = installed ? await lastRuns(db).catch(() => ({})) : {};
  const health = sourceHealth({ ...(await healthContext()), lastRuns: runs });
  const now = new Date().toISOString();
  const q = async <T,>(sql: string, p: unknown[] = []) => installed ? (await db.query<T>(sql, p)).rows : [];

  const hunter = installed && tab === "hunter" ? await productHunter(db, now, 10) : [];
  const watch = tab === "watchlist" ? await q<{ id: string; seller_name: string; seller_url: string | null; seller_external_id: string | null; resolution: string;
    declared_brand_slugs: string[]; priority: number; active: boolean; added_by: string | null; added_at: string; obs: number; last_obs: string | null }>(`select w.id, w.seller_name,
      w.seller_url, w.seller_external_id, w.resolution, w.declared_brand_slugs, w.priority, w.active, w.added_by, w.added_at::text,
      (select count(*)::int from public.market_product_observation o where o.seller_external_id = w.seller_external_id and o.source = 'MANUAL_BROWSER_CAPTURE') as obs,
      (select max(o.observed_at)::text from public.market_product_observation o where o.seller_external_id = w.seller_external_id) as last_obs
    from public.market_watchlist w order by w.active desc, w.priority, w.added_at desc`) : [];
  const brandCounts = tab === "watchlist" ? await q<{ brand_slug: string; n: number }>(`select brand_slug, count(*)::int as n from public.market_product where first_source = 'TRENDYOL_SITEMAP'
    group by 1`) : [];
  const obs = tab === "observations" ? await q<{ id: string; source: string; observed_at: string; known_at: string; external_id: string; url: string | null; seller_name: string | null;
    raw_title: string | null; price: string | null; currency: string | null; rating: string | null; review_count: number | null; public_sales_signal: string | null; badge: string | null;
    data_grade: string; captured_by: string | null; n: number }>(`select o.id, o.source, o.observed_at::text, o.known_at::text, p.external_id, p.url, o.seller_name, o.raw_title, o.price::text,
      o.currency, o.rating::text, o.review_count, o.public_sales_signal, o.badge, o.data_grade, o.captured_by,
      (select count(*)::int from public.market_product_observation x where x.product_id = o.product_id) as n
    from public.market_product_observation o join public.market_product p on p.id = o.product_id order by o.known_at desc limit 60`) : [];
  const buybox = tab === "observations" ? await q<{ barcode: string; observed_at: string; our_buybox_rank: number | null; buybox_price: string | null; multiple_sellers: boolean | null;
    second_price: string | null; third_price: string | null }>(`select distinct on (barcode) barcode, observed_at::text, our_buybox_rank, buybox_price::text, multiple_sellers,
      second_price::text, third_price::text from public.market_buybox_observation order by barcode, known_at desc limit 50`) : [];
  const sourcing = tab === "sourcing" ? await q<{ id: string; provider: string; source_url: string | null; supplier_name: string | null; title: string | null;
    displayed_price_min: string | null; displayed_price_max: string | null; currency: string | null; moq: number | null; material: string | null; dimensions: string | null;
    landed_cost_status: string; observed_at: string; created_by: string | null; opportunity_id: string | null }>(`select id, provider, source_url, supplier_name, title,
      displayed_price_min::text, displayed_price_max::text, currency, moq, material, dimensions, landed_cost_status, observed_at::text, created_by, opportunity_id
    from public.market_sourcing_candidate order by known_at desc limit 50`) : [];
  const opps = tab === "sourcing" ? await q<{ id: string; title: string }>(`select id, title from public.market_opportunity where state <> 'REJECTED' order by created_at desc limit 50`) : [];
  let legacy: { candidates: number; decisions: number; imported: number } | null = null;
  if (tab === "sources") {
    try {
      const [c] = await prisma.$queryRawUnsafe<{ candidates: number; decisions: number }[]>(`select (select count(*)::int from public.candidates) as candidates,
        (select count(*)::int from public.decisions) as decisions`);
      const imported = installed ? (await db.query<{ n: number }>(`select count(*)::int as n from public.market_opportunity where legacy_ref is not null`)).rows[0].n : 0;
      legacy = { ...c, imported };
    } catch { legacy = null; }
  }

  return <div className="space-y-6">
    <PageHeader title="Market Scout" subtitle="Pazar istihbaratı: keşfet → doğrula → ölç → öner. Gözlem, tahmin ve doğrulanmış finansal gerçek ayrı tutulur."
      breadcrumb={[{ label: "İthalat" }, { label: "Market Scout" }]}
      meta={<><Badge variant="neutral">Toplayıcılar zamanlanmamış</Badge><Badge variant="neutral">Forecast V2&apos;den bağımsız</Badge>
        {!installed && <Badge variant="warn">Migration uygulanmadı</Badge>}</>} />
    {sp.ok && <Card className="p-3 text-sm text-[var(--ok)]">Kaydedildi: {sp.ok}</Card>}
    {sp.err && <Card className="p-3 text-sm text-[var(--danger)]">Hata: {sp.err}</Card>}
    {!installed && <Card className="p-4 text-sm">market_* tabloları bu veritabanında yok (migration <code>20261007100000_market_scout_foundation</code> onay bekliyor). Yalnız kaynak sağlığı gösterilir.</Card>}
    <nav className="flex flex-wrap gap-2 text-sm">{TABS.map(([k, l]) => <Link key={k} href={`?tab=${k}`} className={`rounded-md border px-3 py-1 ${tab === k ? "bg-[var(--surface-3)] font-semibold" : ""}`}>{l}</Link>)}</nav>

    {tab === "hunter" && <section className="space-y-3">
      <p className="text-xs text-[var(--text-muted)]">En fazla 10 aday; marj ve iniş maliyeti doğrulanana kadar UNKNOWN. Otomatik sipariş / satın alma yok.</p>
      {installed && hunter.length === 0 && <Card className="p-4 text-sm">Henüz fırsat yok. Pazar gözlemleri sekmesinden bir capture&apos;ı fırsata çevirin.</Card>}
      {hunter.map(c => <HunterCardView key={c.id} c={c} />)}
    </section>}

    {tab === "watchlist" && <section className="space-y-3">
      <Card className="p-4"><form action={addWatchlistAction} className="grid gap-2 sm:grid-cols-2">
        <Field name="sellerName" label="Mağaza adı" required /><Field name="sellerUrl" label="Mağaza URL (trendyol.com/magaza/…-m-ID)" />
        <Field name="brandSlugs" label="Mağazanın KENDİ marka slug'ları (virgülle; beyan)" placeholder="ör. luxury-faucet" /><Field name="priority" label="Öncelik 1–5" type="number" />
        <Field name="notes" label="Not" /><div className="flex items-end"><button className="rounded-md border px-3 py-1.5 text-sm">Ekle</button></div>
      </form><p className="mt-2 text-xs text-[var(--text-muted)]">Mağaza ID&apos;si izinli sitemap&apos;ten veya verdiğiniz URL&apos;den çözülür; mağaza sayfası sunucudan çekilmez. Sitemap ürünleri yalnız markaya bağlıdır — mağaza-ürün ilişkisi beyan edilen marka slug&apos;ı ile kurulur.</p></Card>
      {watch.map(w => <Card key={w.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
        <div><b>{w.seller_name}</b> <Badge variant={w.resolution === "SITEMAP" ? "ok" : w.resolution === "URL_PARSE" ? "info" : "neutral"}>{w.resolution}</Badge>
          {isDemo(w.added_by) && <Badge variant="warn">DEMO</Badge>}{!w.active && <Badge>pasif</Badge>}
          <div className="text-xs text-[var(--text-muted)]">ID {w.seller_external_id ?? U} · öncelik {w.priority} · beyan markalar: {w.declared_brand_slugs.join(", ") || "—"}</div>
          <div className="text-xs">AUTOMATIC (sitemap, marka): {w.declared_brand_slugs.map(b => `${b}: ${brandCounts.find(x => x.brand_slug === b)?.n ?? 0} ürün`).join(" · ") || U} ·
            MANUAL: {w.obs} capture (son {time(w.last_obs)}) · fiyat/yorum/satış (otomatik): {U}</div></div>
        <form action={setWatchlistActiveAction}><input type="hidden" name="id" value={w.id} /><input type="hidden" name="active" value={String(!w.active)} />
          <button className="rounded-md border px-2 py-1 text-xs">{w.active ? "Pasifleştir" : "Etkinleştir"}</button></form>
      </Card>)}
    </section>}

    {tab === "observations" && <section className="space-y-3">
      <Card className="p-4"><h3 className="mb-2 text-sm font-semibold">Manuel capture (tarayıcınızda gördüğünüz değerler)</h3>
        <form action={manualCaptureAction} className="grid gap-2 sm:grid-cols-3">
          <Field name="productUrl" label="Trendyol ürün URL" required /><Field name="sellerName" label="Satıcı" /><Field name="sellerUrl" label="Satıcı mağaza URL" />
          <Field name="title" label="Ürün başlığı" /><Field name="price" label="Fiyat (TL)" type="number" /><Field name="rating" label="Puan (0–5)" type="number" />
          <Field name="reviewCount" label="Yorum sayısı" type="number" /><Field name="publicSalesSignal" label="Görünen satış sinyali (ör. 100+ / 3 gün)" /><Field name="badge" label="Rozet / sıralama" />
          <Field name="imageUrl" label="Görsel URL (cdn.dsmcdn.com)" /><Field name="observedAt" label="Görüldüğü an (ISO, boşsa şimdi)" /><Field name="notes" label="Not" />
          <div className="flex items-end"><button className="rounded-md border px-3 py-1.5 text-sm">Kaydet (yeni gözlem)</button></div>
        </form><p className="mt-2 text-xs text-[var(--text-muted)]">Her kayıt yeni bir append-only gözlemdir; görünen satış sinyali gerçek satış adedi değildir. Sunucu sayfayı çekmez.</p></Card>
      <Card className="overflow-x-auto p-4"><h3 className="mb-2 text-sm font-semibold">Ürün gözlemleri (son 60)</h3>
        <table className="w-full text-xs"><thead><tr className="text-left text-[var(--text-muted)]"><th>Tür</th><th>Kaynak</th><th>Ürün</th><th>Satıcı</th><th className="text-right">Fiyat</th>
          <th className="text-right">Puan</th><th className="text-right">Yorum</th><th>Satış sinyali</th><th>Derece</th><th>Görüldü</th><th>Kayıt</th><th /></tr></thead>
          <tbody>{obs.map(o => <tr key={o.id} className="border-t border-[var(--border)] align-top">
            <td><Badge variant={KIND(o.source) === "AUTOMATIC" ? "info" : "neutral"}>{KIND(o.source)}</Badge>{isDemo(o.captured_by) && <Badge variant="warn">DEMO</Badge>}</td>
            <td>{o.source}</td><td className="max-w-[260px]">{o.raw_title ?? U}<div className="font-mono text-[10px]">{o.external_id} · {o.n} gözlem</div></td><td>{o.seller_name ?? U}</td>
            <td className="text-right">{o.price == null ? U : `${v(o.price)} ${o.currency ?? ""}`}</td><td className="text-right">{v(o.rating, 1)}</td><td className="text-right">{v(o.review_count, 0)}</td>
            <td>{o.public_sales_signal ?? U}</td><td>{o.data_grade}</td><td>{time(o.observed_at)}</td><td>{time(o.known_at)}</td>
            <td>{o.source === "MANUAL_BROWSER_CAPTURE" && <form action={createOpportunityAction}><input type="hidden" name="observationId" value={o.id} /><button className="rounded border px-1.5 py-0.5">Fırsat yap</button></form>}</td>
          </tr>)}</tbody></table></Card>
      <Card className="overflow-x-auto p-4"><h3 className="mb-2 text-sm font-semibold">Buybox — bizim barkodlarımız (resmi API, A) · rakip satış adedi değildir</h3>
        {buybox.length === 0 ? <p className="text-xs">{U} — buybox toplayıcı çalıştırılmadı (zamanlanmış değil).</p> :
          <table className="w-full text-xs"><thead><tr className="text-left text-[var(--text-muted)]"><th>Barkod</th><th>Sıramız</th><th className="text-right">Buybox</th><th>Çok satıcı</th>
            <th className="text-right">2.</th><th className="text-right">3.</th><th>Görüldü</th></tr></thead>
            <tbody>{buybox.map(b => <tr key={b.barcode} className="border-t border-[var(--border)]"><td className="font-mono">{b.barcode}</td><td>{v(b.our_buybox_rank, 0)}</td>
              <td className="text-right">{v(b.buybox_price)}</td><td>{b.multiple_sellers == null ? U : b.multiple_sellers ? "evet" : "hayır"}</td><td className="text-right">{v(b.second_price)}</td>
              <td className="text-right">{v(b.third_price)}</td><td>{time(b.observed_at)}</td></tr>)}</tbody></table>}</Card>
    </section>}

    {tab === "sourcing" && <section className="space-y-3">
      <Card className="p-4"><h3 className="mb-2 text-sm font-semibold">Manuel tedarik adayı (Alibaba / 1688 / Made-in-China)</h3>
        <form action={manualSourcingAction} className="grid gap-2 sm:grid-cols-3">
          <Field name="sourceUrl" label="Ürün URL" required /><Field name="supplierName" label="Tedarikçi" /><Field name="supplierLocation" label="Konum" />
          <Field name="title" label="Başlık" /><Field name="displayedPriceMin" label="Görünen fiyat min" type="number" /><Field name="displayedPriceMax" label="Görünen fiyat max" type="number" />
          <label className="space-y-1 text-xs"><span className="text-[var(--text-muted)]">Para birimi</span><select name="currency" className={input}><option value="USD">USD</option><option value="CNY">CNY</option><option value="EUR">EUR</option></select></label>
          <Field name="moq" label="MOQ" type="number" /><Field name="material" label="Malzeme" /><Field name="dimensions" label="Ölçüler" /><Field name="imageUrl" label="Görsel URL" />
          <label className="space-y-1 text-xs"><span className="text-[var(--text-muted)]">Fırsat</span><select name="opportunityId" className={input}><option value="">—</option>
            {opps.map(o => <option key={o.id} value={o.id}>{o.title.slice(0, 60)}</option>)}</select></label>
          <Field name="notes" label="Not" /><div className="flex items-end"><button className="rounded-md border px-3 py-1.5 text-sm">Kaydet</button></div>
        </form><p className="mt-2 text-xs text-[var(--text-muted)]">Görünen fiyat iniş maliyeti DEĞİLDİR; iniş maliyeti UNKNOWN kalır (navlun, GTİP, vergi doğrulanınca ayrıca). URL sunucudan çekilmez.</p></Card>
      <Card className="overflow-x-auto p-4"><table className="w-full text-xs"><thead><tr className="text-left text-[var(--text-muted)]"><th>Kaynak</th><th>Tedarikçi</th><th>Başlık</th>
        <th className="text-right">Görünen fiyat</th><th className="text-right">MOQ</th><th>Malzeme / ölçü</th><th>İniş maliyeti</th><th>Görüldü</th></tr></thead>
        <tbody>{sourcing.map(s => <tr key={s.id} className="border-t border-[var(--border)] align-top"><td>{s.provider} <Badge>MANUAL</Badge>{isDemo(s.created_by) && <Badge variant="warn">DEMO</Badge>}</td>
          <td>{s.supplier_name ?? U}</td><td className="max-w-[260px]">{s.title ?? U}</td><td className="text-right">{s.displayed_price_min == null ? U : `${v(s.displayed_price_min)}–${v(s.displayed_price_max)} ${s.currency ?? ""}`}</td>
          <td className="text-right">{v(s.moq, 0)}</td><td>{s.material ?? U} / {s.dimensions ?? U}</td><td><Badge variant="neutral">{s.landed_cost_status}</Badge></td><td>{time(s.observed_at)}</td></tr>)}</tbody></table></Card>
    </section>}

    {tab === "sources" && <section className="space-y-3">
      <Card className="overflow-x-auto p-4"><h3 className="mb-2 text-sm font-semibold">Veri kaynakları — CFO&apos;nun gerçekten görebildiği</h3>
        <table className="w-full text-xs"><thead><tr className="text-left text-[var(--text-muted)]"><th>Kaynak</th><th>Durum</th><th>Zamanlama</th><th>Son çalışma</th><th>Açıklama</th></tr></thead>
          <tbody>{health.map(h => <tr key={h.key} className="border-t border-[var(--border)] align-top"><td>{h.label}</td><td><Badge variant={HEALTH_VARIANT[h.status]}>{h.status}</Badge></td>
            <td>kapalı</td><td>{h.lastRun ? `${h.lastRun.status} · ${time(h.lastRun.finishedAt)}` : "—"}</td><td>{h.reason}</td></tr>)}</tbody></table>
        <p className="mt-2 text-[11px] text-[var(--text-muted)]">Doğrulama tarihi 2026-10-06. Hiçbir toplayıcı zamanlanmış değildir; anti-bot / CAPTCHA aşımı, sahte UA veya proxy kullanılmaz.</p></Card>
      <Card className="p-4 text-xs"><h3 className="mb-1 text-sm font-semibold">Eski scout modeli (candidates / scores / signals_daily / decisions)</h3>
        {legacy ? <p>{legacy.candidates} aday, {legacy.decisions} insan kararı — salt okunur. İçe aktarılan: {legacy.imported} (yazan sistem: UNKNOWN). Eski tablolar silinmez.</p> : <p>{U}</p>}</Card>
    </section>}
  </div>;
}
