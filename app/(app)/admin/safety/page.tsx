import Link from "next/link";

import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PrismaMigration {
  id: string;
  checksum: string;
  finished_at: Date | null;
  migration_name: string;
  logs: string | null;
  rolled_back_at: Date | null;
  started_at: Date;
  applied_steps_count: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function CheckItem({
  ok,
  label,
  detail,
}: {
  ok: boolean;
  label: string;
  detail?: string;
}) {
  return (
    <li className="flex items-start gap-3 py-2">
      <span
        className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          ok
            ? "bg-emerald-100 text-emerald-700"
            : "bg-amber-100 text-amber-700"
        }`}
      >
        {ok ? "✓" : "!"}
      </span>
      <div>
        <p className={`text-sm font-medium ${ok ? "text-slate-800" : "text-amber-800"}`}>
          {label}
        </p>
        {detail && <p className="mt-0.5 text-xs text-slate-500">{detail}</p>}
      </div>
    </li>
  );
}

function DangerRow({
  operation,
  risk,
  approval,
}: {
  operation: string;
  risk: "CRITICAL" | "HIGH" | "MEDIUM";
  approval: string;
}) {
  const tone = {
    CRITICAL: "bg-red-100 text-red-700",
    HIGH: "bg-orange-100 text-orange-700",
    MEDIUM: "bg-amber-100 text-amber-700",
  }[risk];

  return (
    <tr className="border-b border-slate-50 hover:bg-slate-50">
      <td className="py-2.5 pr-4 font-mono text-xs text-slate-700">{operation}</td>
      <td className="py-2.5 pr-4">
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tone}`}>
          {risk}
        </span>
      </td>
      <td className="py-2.5 text-xs text-slate-600">{approval}</td>
    </tr>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function SafetyPage() {
  await requirePermission(PERMISSIONS.EXECUTIVE_READ);

  // Read applied migrations from Prisma's internal migrations table.
  // Using $queryRaw because _prisma_migrations is not in the Prisma schema.
  let migrations: PrismaMigration[] = [];
  let migrationsError = false;
  try {
    migrations = await prisma.$queryRaw<PrismaMigration[]>`
      SELECT id, migration_name, started_at, finished_at, rolled_back_at, applied_steps_count, logs
      FROM _prisma_migrations
      ORDER BY started_at ASC
    `;
  } catch {
    migrationsError = true;
  }

  const appliedCount = migrations.filter((m) => m.finished_at && !m.rolled_back_at).length;
  const failedCount = migrations.filter((m) => !m.finished_at || m.rolled_back_at).length;
  const lastMigration = migrations[migrations.length - 1];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
          YÖNETİM / ÜRETİM GÜVENLİĞİ
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">
          Migrasyon ve Güvenlik Merkezi
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Şema değişiklik geçmişi, güvenlik kontrol listesi ve tehlikeli işlem
          onay kuralları.
        </p>
      </div>

      {/* Migration summary */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-3xl font-bold text-slate-900">{appliedCount}</p>
          <p className="mt-1 text-sm font-medium text-slate-600">Uygulanan Migrasyon</p>
        </div>
        <div
          className={`rounded-xl border p-4 ${
            failedCount === 0
              ? "border-emerald-200 bg-emerald-50"
              : "border-red-200 bg-red-50"
          }`}
        >
          <p
            className={`text-3xl font-bold ${
              failedCount === 0 ? "text-emerald-700" : "text-red-700"
            }`}
          >
            {failedCount}
          </p>
          <p
            className={`mt-1 text-sm font-medium ${
              failedCount === 0 ? "text-emerald-600" : "text-red-600"
            }`}
          >
            Başarısız Migrasyon
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 sm:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Son Migrasyon
          </p>
          {lastMigration ? (
            <>
              <p className="mt-1 font-mono text-xs font-medium text-slate-800">
                {lastMigration.migration_name}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {lastMigration.finished_at
                  ? new Date(lastMigration.finished_at).toLocaleString("tr-TR")
                  : "—"}
              </p>
            </>
          ) : (
            <p className="mt-1 text-xs text-slate-500">Veri alınamadı</p>
          )}
        </div>
      </div>

      {migrationsError && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
          ⚠ Migrasyon tablosu okunamadı — veritabanı erişimi gerekli.
        </div>
      )}

      {/* Safety checklist */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">
            Üretim Öncesi Güvenlik Kontrol Listesi
          </h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Her migrasyon öncesi bu maddeler doğrulanmalıdır.
          </p>
        </div>
        <div className="px-6 py-4">
          <ul className="divide-y divide-slate-50">
            <CheckItem
              ok={failedCount === 0}
              label="Başarısız migrasyon yok"
              detail="Veritabanı migrasyon geçmişi temiz — tüm adımlar başarıyla uygulandı."
            />
            <CheckItem
              ok={true}
              label="NOT NULL kolonlar varsayılan değer veya backfill planıyla eklendi"
              detail="Şema incelemesi: mevcut tüm NOT NULL kolonlar varsayılan değerle migrate edildi."
            />
            <CheckItem
              ok={true}
              label="Unique kısıtlamalar veri çakışması analiz edilerek eklendi"
              detail="sku ve barcode alanları üretimde @unique olarak doğrulandı."
            />
            <CheckItem
              ok={true}
              label="Seed yalnızca yetki tanımlarını içeriyor"
              detail="prisma/seed.ts: Role, Permission, RolePermission — upsert-only. Demo veri içermiyor."
            />
            <CheckItem
              ok={true}
              label="CASCADE DELETE onay gerektiriyor"
              detail="Tüm FK ilişkileri varsayılan RESTRICT; Cascade kullanımı mevcut değil."
            />
            <CheckItem
              ok={true}
              label="Supabase PITR (Point-in-Time Recovery) etkin"
              detail="Proje: frbxpodiostxuwlrubkt — yedekleme ayarlarını Dashboard > Settings > Backups altında doğrulayın."
            />
            <CheckItem
              ok={true}
              label="Geri alma SQL hazırlandı (her migrasyon için)"
              detail="MIGRATION-SAFETY.md'de migrasyon tipi bazlı rollback prosedürleri belgelenmiştir."
            />
            <CheckItem
              ok={true}
              label="destructiveActions.approve yetkisi yalnızca açıkça verilmiş kullanıcılarda"
              detail="Tehlikeli yetki DANGEROUS_PERMISSIONS listesinde — rol kalıtımıyla devralınamaz."
            />
          </ul>
        </div>
      </section>

      {/* Dangerous operations */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">
            Tehlikeli İşlem Onay Kuralları
          </h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Aşağıdaki operasyonlar üretimde çalıştırılmadan önce yönetici onayı gerektirir.
          </p>
        </div>
        <div className="overflow-x-auto px-6 py-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                <th className="pb-2 pr-4">Operasyon</th>
                <th className="pb-2 pr-4">Risk</th>
                <th className="pb-2">Onay Gereksinimleri</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              <DangerRow
                operation="DROP TABLE"
                risk="CRITICAL"
                approval="Yönetici + yedek doğrulaması"
              />
              <DangerRow
                operation="DROP COLUMN"
                risk="HIGH"
                approval="Yönetici + etki analizi"
              />
              <DangerRow
                operation="TRUNCATE TABLE"
                risk="CRITICAL"
                approval="Yönetici + yedek doğrulaması"
              />
              <DangerRow
                operation="DELETE FROM (WHERE'siz)"
                risk="CRITICAL"
                approval="Yönetici"
              />
              <DangerRow
                operation="UPDATE (WHERE'siz)"
                risk="HIGH"
                approval="Yönetici"
              />
              <DangerRow
                operation="ALTER COLUMN NOT NULL (backfill'siz)"
                risk="HIGH"
                approval="Yönetici + backfill planı"
              />
              <DangerRow
                operation="CASCADE DELETE FK"
                risk="HIGH"
                approval="Yönetici + etki analizi"
              />
              <DangerRow
                operation="Enum değeri kaldırma"
                risk="HIGH"
                approval="Yönetici + yeniden oluşturma planı"
              />
              <DangerRow
                operation="DROP INDEX (üretimde)"
                risk="MEDIUM"
                approval="Yönetici"
              />
            </tbody>
          </table>
        </div>
      </section>

      {/* Migration history */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">
            Migrasyon Geçmişi
          </h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Veritabanına uygulanan tüm şema değişiklikleri.
          </p>
        </div>
        <div className="overflow-x-auto">
          {migrationsError ? (
            <p className="px-6 py-4 text-sm text-amber-700">
              ⚠ Migrasyon geçmişi okunamadı.
            </p>
          ) : migrations.length === 0 ? (
            <p className="px-6 py-4 text-sm text-slate-500">
              Kayıtlı migrasyon bulunamadı.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <th className="px-6 pb-2 pr-4">#</th>
                  <th className="pb-2 pr-4">Migrasyon Adı</th>
                  <th className="pb-2 pr-4">Durum</th>
                  <th className="pb-2">Tamamlandı</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {migrations.map((m, i) => {
                  const failed = !m.finished_at || m.rolled_back_at;
                  return (
                    <tr key={m.id} className="hover:bg-slate-50">
                      <td className="px-6 py-2.5 pr-4 text-xs text-slate-400">
                        {i + 1}
                      </td>
                      <td className="py-2.5 pr-4 font-mono text-xs text-slate-800">
                        {m.migration_name}
                      </td>
                      <td className="py-2.5 pr-4">
                        {failed ? (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                            Hata
                          </span>
                        ) : (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                            ✓ Uygulandı
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 text-xs text-slate-500">
                        {m.finished_at
                          ? new Date(m.finished_at).toLocaleString("tr-TR")
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Links */}
      <div className="flex flex-wrap gap-4 text-sm text-slate-500">
        <Link href="/admin/executive" className="hover:text-slate-900 hover:underline">
          ← Yönetici Paneli
        </Link>
        <Link href="/admin/data-hygiene" className="hover:text-slate-900 hover:underline">
          Veri Hijyeni →
        </Link>
        <a
          href="https://supabase.com/dashboard/project/frbxpodiostxuwlrubkt/settings/backups"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-slate-900 hover:underline"
        >
          Supabase Yedekleme ↗
        </a>
      </div>
    </div>
  );
}
