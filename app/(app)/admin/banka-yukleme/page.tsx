import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { BankTools } from "@/components/banka/bank-tools";

export const dynamic = "force-dynamic";

export default async function BankUploadPage() {
  await requirePermission(PERMISSIONS.CFO_WRITE);
  const [banks, history] = await Promise.all([
    prisma.cfoBankAccount.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    prisma.cfoChangeLog.findMany({ where: { area: "banka" }, orderBy: { changedAt: "desc" }, take: 10 }),
  ]);
  const accounts = banks.map(a => ({ id: a.id, name: a.name, accountType: a.accountType, balanceTry: a.balanceTry === null ? null : Number(a.balanceTry), updatedAt: a.updatedAt.toISOString(), lastUpdatedAt: a.lastUpdatedAt.toISOString() }));
  return <div className="space-y-6">
    <h1 className="text-2xl font-semibold">Banka yükleme</h1>
    <p>Ekstrenizi yükleyin, hareketleri inceleyin ve banka bakiyesini ayrı bir onayla güncelleyin. Onaydan önce hiçbir kayıt değişmez.</p>
    {accounts.length ? <BankTools accounts={accounts} /> : <p>Önce aktif bir banka hesabı ekleyin.</p>}
    <h2 className="text-lg font-semibold">Son banka işlemleri</h2>
    <div className="space-y-2">{history.map(entry => <div key={entry.id} className="rounded border border-[var(--border-default)] p-3 text-sm">
      <p>{entry.changedAt.toLocaleString("tr-TR")} · {entry.item}</p>
      <p>{entry.oldValue ?? "—"} → {entry.newValue ?? "—"}</p>
    </div>)}</div>
  </div>;
}
