/**
 * CFO / Sorular — CFO ↔ Alperen soru-cevap defteri.
 *
 * Neden: CFO'nun her sabah sohbetten soru sorması, cevapların sohbet geçmişinde
 * kalması demekti. Artık sorular burada durur, cevaplar veritabanında kalıcı olur
 * ve sonraki analizlere girdi olarak akar.
 *
 * İlk ekranda öncelikli beş soru; diğer sorular sayfalı bekleyen listesinde kalır.
 */
import { questionSourceHref } from "@/lib/cfo/question-links";
import Link from "next/link";
import { MessageCircleQuestion, Paperclip } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { fmtDate } from "@/lib/cfo/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AnswerForm, ProcessedButton, CancelButton } from "./answer-form";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const AREA_TR: Record<string, string> = {
  nakit: "Nakit", marj: "Marj", stok: "Stok", siparis: "Sipariş",
  gumruk: "Gümrük", urun: "Ürün", banka: "Banka", seo: "SEO", diger: "Diğer",
};

const PRIO = [
  { n: 1, label: "Acil — bir kararı bloke ediyor", variant: "danger" as const },
  { n: 2, label: "Yüksek", variant: "warn" as const },
  { n: 3, label: "Normal", variant: "info" as const },
  { n: 4, label: "Düşük", variant: "neutral" as const },
  { n: 5, label: "Bilgi", variant: "neutral" as const },
];

function fmtSize(b: number | null) {
  if (b == null) return "";
  return b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`;
}

export default async function CfoQuestionsPage({searchParams}: {searchParams:Promise<{page?:string;question?:string}>}) {
  await requirePermission(PERMISSIONS.CFO_READ);

  const params=await searchParams;
  const focusId=typeof params.question==='string'&&params.question.length<=150?params.question:null;
  const parsedPage=Number(params.page??1);
  const page=Number.isSafeInteger(parsedPage)&&parsedPage>0?Math.min(parsedPage,10000):1;
  const [top,backlog,answered,openCount,answeredCount,urgent,unprocessed,focused] = await Promise.all([
    prisma.cfoQuestion.findMany({where:{status:'ACIK'},include:{attachments:true},orderBy:[{priority:'asc'},{askedAt:'asc'},{id:'asc'}],take:5}),
    prisma.cfoQuestion.findMany({where:{status:'ACIK'},include:{attachments:true},orderBy:[{priority:'asc'},{askedAt:'asc'},{id:'asc'}],skip:5+(page-1)*20,take:20}),
    prisma.cfoQuestion.findMany({where:{status:'CEVAPLANDI'},include:{attachments:{orderBy:{uploadedAt:'asc'}}},orderBy:{answeredAt:'desc'},take:20}),
    prisma.cfoQuestion.count({where:{status:'ACIK'}}),
    prisma.cfoQuestion.count({where:{status:'CEVAPLANDI'}}),
    prisma.cfoQuestion.count({where:{status:'ACIK',priority:{lte:2}}}),
    prisma.cfoQuestion.count({where:{status:'CEVAPLANDI',processedAt:null,OR:[{processNote:null},{NOT:{processNote:{startsWith:'workflow_read:'}}}]}}),
    focusId?prisma.cfoQuestion.findUnique({where:{id:focusId},include:{attachments:true}}):Promise.resolve(null),
  ]);
  const identities=await prisma.$queryRawUnsafe<{id:string;scope:string|null;entity_key:string|null}[]>(`select id,to_jsonb(q)->>'scope' as scope,to_jsonb(q)->>'entity_key' as entity_key from cfo_question q where id=any($1::text[])`,[...top,...backlog,...answered,...(focused?[focused]:[])].map(q=>q.id));
  const identity=new Map(identities.map(q=>[q.id,q]));
  const sourceLink=(id:string)=>{const q=identity.get(id),href=questionSourceHref(q?.scope??null);return href?<Link href={href} className="mt-2 block text-xs underline">İlgili plan / ürün: {q?.entity_key} →</Link>:null;};
  const questionRow=(q:(typeof top)[number])=>{
    const p=PRIO.find(x=>x.n===q.priority)??PRIO[2];
    return <li key={q.id} id={`question-${q.id}`} className="rounded-lg border border-[var(--border)] p-4">
      <div className="mb-1 flex flex-wrap items-center gap-2"><Badge variant={p.variant}>{p.label}</Badge>
        <Badge variant="neutral">{AREA_TR[q.area]??q.area}</Badge><span className="text-[11px] text-[var(--text-muted)]">{fmtDate(q.askedAt)}</span>
        <span className="ml-auto"><CancelButton questionId={q.id}/></span></div>
      <p className="text-sm font-medium text-[var(--text-primary)]">{q.question}</p>
      {q.why&&<p className="mt-1 text-xs text-[var(--text-muted)]"><strong>Neden gerekiyor:</strong> {q.why}</p>}
      {sourceLink(q.id)}<AnswerForm questionId={q.id}/></li>;
  };

  const answeredRow=(q:(typeof top)[number])=>(<li key={q.id} id={`question-${q.id}`} className="rounded-lg border border-[var(--border)] p-4">
                {q.status==='IPTAL'&&<p className="text-xs">Bu soru iptal edildi; CFO yeniden açmaz.</p>}
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <Badge variant="neutral">{AREA_TR[q.area] ?? q.area}</Badge>
                  <span className="text-[11px] text-[var(--text-muted)]">
                    soruldu {fmtDate(q.askedAt)} · cevaplandı {fmtDate(q.answeredAt)}
                    {q.answeredBy ? ` · ${q.answeredBy}` : ""}
                  </span>
                  <span className="ml-auto flex items-center gap-2">
                    {q.status==='IPTAL'?<Badge variant="neutral">İptal edildi</Badge>:q.processedAt ? (
                      <Badge variant="ok">CFO işledi · {fmtDate(q.processedAt)}</Badge>
                    ) : (
                      <>
                        <Badge variant={q.processNote?.startsWith("workflow_read:")?"info":"warn"}>{q.processNote?.startsWith("workflow_read:")?"CFO okudu · doğrulama bekliyor":"CFO henüz okumadı"}</Badge>
                        <ProcessedButton questionId={q.id} />
                      </>
                    )}
                  </span>
                </div>
                <p className="text-sm font-medium text-[var(--text-primary)]">{q.question}</p>
                {sourceLink(q.id)}
                {q.answer && (
                  <p className="mt-2 whitespace-pre-wrap rounded bg-[var(--surface-1)] p-2 text-sm text-[var(--text-secondary)]">
                    {q.answer}
                  </p>
                )}
                {q.attachments.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {q.attachments.map((f) => (
                      <a
                        key={f.id}
                        href={`/api/admin/ai-cfo/files/${f.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--accent)] hover:border-[var(--accent)]"
                      >
                        <Paperclip size={12} />
                        {f.fileName}
                        <span className="text-[var(--text-muted)]">{fmtSize(f.sizeBytes)}</span>
                      </a>
                    ))}
                  </div>
                )}
                {q.processNote && (
                  <p className="mt-2 text-xs text-[var(--text-muted)]"><strong>CFO notu:</strong> {q.processNote}</p>
                )}
                {q.status!=='IPTAL'&&<details className="mt-2">
                  <summary className="cursor-pointer text-[11px] text-[var(--text-muted)]">Cevabı güncelle</summary>
                  <AnswerForm questionId={q.id} existingAnswer={q.answer} />
                </details>}
              </li>);

  return (
    <>
      <PageHeader
        icon={MessageCircleQuestion}
        title="CFO Soruları"
        subtitle="CFO'nun cevap bekleyen soruları, önem sırasına göre. Yazıyla cevapla, gerekiyorsa dosya ekle."
      />

      <Card className="mb-6 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant={urgent > 0 ? "danger" : "info"}>{openCount} açık soru</Badge>
          {urgent > 0 && <Badge variant="warn">{urgent} tanesi acil/yüksek</Badge>}
          <Badge variant="neutral">{answeredCount} cevaplanmış</Badge>
          {unprocessed > 0 && <Badge variant="warn">{unprocessed} CFO işlemedi</Badge>}
          <Link href="/cfo/defter" className="ml-auto text-xs text-[var(--accent)] hover:underline">
            Not Defteri →
          </Link>
        </div>
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          Önce aşağıdaki en önemli 5 soruyu yanıtla. Diğerleri bekleyen listesinde korunur.
          Cevaplar sonraki çalışmada okunur; doğrulanmış bilgi için aynı soru tekrar açılmaz.
        </p>
      </Card>

      {params.question&&<Card className="mb-6 p-5"><h2 className="mb-3 font-semibold">Bağlantıdaki soru</h2>{focused?<ul>{focused.status==='ACIK'?questionRow(focused):answeredRow(focused)}</ul>:<p>Soru bulunamadı. Diğer sorular aşağıda korunuyor.</p>}</Card>}
      <Card className="mb-6 p-5">
        <h2 className="mb-4 text-sm font-semibold text-[var(--text-primary)]">Önce yanıtla · en önemli 5 soru</h2>
        {top.length===0?<p className="text-xs text-[var(--text-muted)]">Açık soru yok.</p>:<ul className="space-y-4">{top.filter(q=>q.id!==focused?.id).map(questionRow)}</ul>}
      </Card>
      {openCount>5&&<Card className="mb-6 p-5"><details open={page>1}>
        <summary className="cursor-pointer">Diğer bekleyen sorular ({openCount-5}) · sayfa {page}</summary>
        <p className="my-3 text-xs">Hepsini aynı anda yanıtlaman gerekmiyor. Öncelikler yeni cevaplar ve çalışma sonuçlarıyla güncellenir.</p>
        <ul className="space-y-4">{backlog.filter(q=>q.id!==focused?.id).map(questionRow)}</ul>
        <div className="mt-4 flex gap-4">{page>1&&<Link href={`/cfo/sorular?page=${page-1}`}>Önceki sayfa</Link>}
          {5+page*20<openCount&&<Link href={`/cfo/sorular?page=${page+1}`}>Sonraki sayfa</Link>}</div>
      </details></Card>}

      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold text-[var(--text-primary)]">Son 20 cevap ({answeredCount} toplam)</h2>
        {answered.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)]">Henüz cevaplanmış soru yok.</p>
        ) : (
          <ul className="space-y-4">
            {answered.filter(q=>q.id!==focused?.id).map(answeredRow)}
          </ul>
        )}
      </Card>
    </>
  );
}
