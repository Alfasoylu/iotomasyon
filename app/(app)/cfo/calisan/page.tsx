import { requirePermission } from '@/lib/auth';
import { PERMISSIONS } from '@/lib/permissions';
import { notFound } from 'next/navigation';
import WorkflowPanel from './panel';
export const dynamic='force-dynamic';export const maxDuration=300;
export default async function CfoWorkerPage(){const user=await requirePermission(PERMISSIONS.CFO_READ);if(user.role!=='ADMIN')notFound();await requirePermission(PERMISSIONS.EXECUTIVE_READ);
  return <div className="space-y-5"><h1 className="text-2xl font-semibold">Çalışan CFO</h1>
    <p>Hedef: sermayeyi büyütmek, borcu azaltmak ve kârlı ürün çeşitliliğiyle aylık 100.000 USD ciroyu aşmak.</p>
    <p>Hobby çalışma düzeni: mevcut günlük XML/Trendyol görevlerinden sonra kontrol; veri yüklemesi, senkron ve soru cevabı sonrasında yeniden değerlendirme. Sayfa açık olmasa da günlük görev çalışır. Saatlik kesintisiz kontrol etkin değil.</p>
    <WorkflowPanel/><p><a className="underline mr-4" href="/cfo/sorular">Sorular ve cevaplar</a><a className="underline mr-4" href="/cfo/defter">CFO Defteri</a><a className="underline" href="/cfo/calisma-durumu">Veri ve hesaplama durumu</a></p></div>;
}
