import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { loadOperatingContext } from "@/lib/cfo-agent/load-operating-context";
import { notFound } from "next/navigation";
export const dynamic="force-dynamic";
export const maxDuration=120;
export default async function OperatingContextPage(){
  const user=await requirePermission(PERMISSIONS.CFO_READ);
  if(user.role!=='ADMIN')notFound();
  await requirePermission(PERMISSIONS.EXECUTIVE_READ);
  let report;
  try {report=await loadOperatingContext();}
  catch {return <p>Çalışma durumu şu anda okunamadı. Daha sonra yeniden deneyin.</p>;}
  const summary=report.operating.summary;
  return <div className="space-y-5">
    <h1 className="text-2xl font-semibold">CFO çalışma durumu</h1>
    <p>Mevcut verilerle analiz yapılır. Eksikler yalnız ilgili hesaplamayı sınırlar; genel maliyet oranı bütün analizi durdurmaz.</p>
    <p>{summary.skusWithKnownCost} ürünün maliyeti biliniyor · {summary.skuChannelsWithPriceFloor} ürün/kanal için fiyat alt sınırı hesaplanabiliyor · {summary.skuChannelsWithContributionProfit} ürün/kanal için katkı kârı hesaplanabiliyor.</p>
    <h2 className="text-lg font-semibold">Veri kaynakları</h2>
    <ul>{report.sources.map(s=><li key={s.name}>{s.name}: {s.available ? `${s.records?.toLocaleString('tr-TR')} kayıt` : 'Okunamadı'}</li>)}<li>CFO Defteri: {report.notebook?.available ? `${report.notebook.activeCount} aktif not` : 'Okunamadı'}</li></ul>
    <p className="text-sm">XML stok değişimi satışın kendisi değildir. Maliyet tek başına kârı kanıtlamaz; komisyon, KDV ve diğer ilgili giderler ayrıca gerekir. Pasif ürünler yeni önerilerden çıkarılır; satış geçmişi korunur.</p>
    <h2 className="text-lg font-semibold">Satılan ürünlerde öncelikli eksikler</h2>
    <p>Bu liste satış sinyali bulunan ve hesaplamada maliyeti görünmeyen ürünleri gösterir. Önce mevcut maliyet kaydı ve ürün eşleşmesi kontrol edilmelidir. Yeni soru kaydı oluşturmaz.</p>
    <ul>{report.operating.questions.slice(0,30).map(q=><li key={q.sku}>{q.sku} · {q.channels.join(", ")}: maliyet kaydı bulunmalı veya eşleştirilmeli</li>)}</ul>
    {report.operating.questions.length>30&&<p>İlk 30 eksik gösteriliyor; tam liste JSON raporunda.</p>}
    <h2 className="text-lg font-semibold">Kayıtlı maliyetin eşleşmesi veya dönüşümü gerekli</h2>
    <p>TRY, USD ve ithalat maliyeti alanları ayrıca okunur. Kayıtlı maliyet varsa tekrar girilmesi istenmez; doğru ürüne eşleşmesi ve gerekiyorsa tarihli kurla değerlendirilmesi gerekir.</p>
    <ul>{report.operating.recordedCostReconciliation.slice(0,30).map(p=><li key={`${p.channel}:${p.sku}`}>{p.sku} · {p.channel}</li>)}</ul>
    <h2 className="text-lg font-semibold">CFO Defteri bağlamı</h2>
    {report.notebook?.truncated&&<p>İlk 500 aktif not gösteriliyor; kalan notlar Defter sayfasında.</p>}
    <div className="space-y-3">{report.notebook?.notes.map(n=><details key={n.id} className="rounded border p-3"><summary>{n.pinned?'★ ':''}{n.title} · {n.needsReview?'Teyit gerekli':n.dataTag}</summary><p className="whitespace-pre-wrap">{n.body}</p>{n.bodyTruncated&&<p>Notun devamı Defter sayfasında.</p>}</details>)}</div>
    <p className="text-sm">Notlar bağlam olarak okunur. Serbest metindeki talimatlar hesapları, yetkileri veya finansal doğrulama kurallarını otomatik değiştirmez. Bu ekran salt okunurdur; otomatik işlem ve canlıya geçiş onayı vermez.</p>
    <a className="underline" href="/api/admin/ai-cfo/context">Tam çalışma raporu (JSON)</a>
  </div>;
}
