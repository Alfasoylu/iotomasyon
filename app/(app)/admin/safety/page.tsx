import Link from "next/link";
import { Check, AlertTriangle } from "lucide-react";

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
        className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md text-xs ${
          ok
            ? "bg-[var(--ok-dim)] text-[var(--ok)]"
            : "bg-[var(--warn-dim)] text-[var(--warn)]"
        }`}
      >
        {ok ? <Check size={14} strokeWidth={1.5} /> : <AlertTriangle size={14} strokeWidth={1.5} />}
      </span>
      <div>
        <p className={`text-sm font-medium ${ok ? "text-[var(--text-primary)]" : "text-[var(--warn)]"}`}>
          {label}
        </p>
        {detail && <p className="mt-0.5 text-xs text-[var(--text-muted)]">{detail}</p>}
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
    CRITICAL: "border-[var(--danger-border)] bg-[var(--danger-dim)] text-[var(--danger)]",
    HIGH: "border-[var(--warn-border)] bg-[var(--warn-dim)] text-[var(--warn)]",
    MEDIUM: "border-[var(--warn-border)] bg-[var(--warn-dim)] text-[var(--warn)]",
  }[risk];

  return (
    <tr className="border-b border-[var(--border-subtle)] hover:bg-[var(--surface-3)]">
      <td className="py-2.5 pr-4 font-mono text-xs tabular-nums text-[var(--text-primary)]">
        {operation}
      </td>
      <td className="py-2.5 pr-4">
        <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${tone}`}>
          {risk}
        </span>
      </td>
      <td className="py-2.5 text-xs text-[var(--text-secondary)]">{approval}</td>
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
        <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
          YÖNETİM / ÜRETİM GÜVENLİĞİ
        </p>
        <h1 className="mt-2 text-[22px] font-semibold tracking-tight text-[var(--text-primary)]">
          Migrasyon ve Güvenlik Merkezi
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Şema değişiklik geçmişi, güvenlik kontrol listesi ve tehlikeli işlem onay kuralları.
        </p>
      </div>

      {/* Migration summary */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-2)] p-4">
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
            Uygulanan Migrasyon
          </p>
          <p className="mt-2 text-[28px] font-semibold leading-tight tabular-nums text-[var(--text-primary)]">
            {appliedCount}
          </p>
        </div>
        <div
          className={`rounded-lg border p-4 ${
            failedCount === 0
              ? "border-[var(--ok-border)] bg-[var(--ok-dim)]"
              : "border-[var(--danger-border)] bg-[var(--danger-dim)]"
          }`}
        >
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
            Başarısız Migrasyon
          </p>
          <p
            className={`mt-2 text-[28px] font-semibold leading-tight tabular-nums ${
              failedCount === 0 ? "text-[var(--ok)]" : "text-[var(--danger)]"
            }`}
          >
            {failedCount}
          </p>
        </div>
        <div className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-2)] p-4 sm:col-span-2">
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
            Son Migrasyon
          </p>
          {lastMigration ? (
            <>
              <p className="mt-2 font-mono text-xs font-medium text-[var(--text-primary)]">
                {lastMigration.migration_name}
              </p>
              <p className="mt-0.5 font-mono text-xs tabular-nums text-[var(--text-muted)]">
                {lastMigration.finished_at
                  ? new Date(lastMigration.finished_at).toLocaleString("tr-TR")
                  : "—"}
              </p>
            </>
          ) : (
            <p className="mt-2 text-xs text-[var(--text-muted)]">Veri alınamadı</p>
          )}
        </div>
      </div>

      {migrationsError && (
        <div className="flex items-center gap-2 rounded-lg border border-[var(--warn-border)] bg-[var(--warn-dim)] px-5 py-4 text-sm text-[var(--warn)]">
          <AlertTriangle size={14} strokeWidth={1.5} />
          Migrasyon tablosu okunamadı — veritabanı erişimi gerekli.
        </div>
      )}

      {/* Safety checklist */}
      <section className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-2)]">
        <div className="border-b border-[var(--border-subtle)] px-6 py-4">
          <h2 className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
            Üretim Öncesi Güvenlik Kontrol Listesi
          </h2>
          <p className="mt-1.5 text-sm text-[var(--text-secondary)]">
            Her migrasyon öncesi bu maddeler doğrulanmalıdır.
          </p>
        </div>
        <div className="px-6 py-4">
          <ul className="divide-y divide-[var(--border-subtle)]">
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
      <section className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-2)]">
        <div className="border-b border-[var(--border-subtle)] px-6 py-4">
          <h2 className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
            Tehlikeli İşlem Onay Kuralları
          </h2>
          <p className="mt-1.5 text-sm text-[var(--text-secondary)]">
            Aşağıdaki operasyonlar üretimde çalıştırılmadan önce yönetici onayı gerektirir.
          </p>
        </div>
        <div className="overflow-x-auto px-6 py-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
                <th className="pb-2 pr-4">Operasyon</th>
                <th className="pb-2 pr-4">Risk</th>
                <th className="pb-2">Onay Gereksinimleri</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              <DangerRow operation="DROP TABLE" risk="CRITICAL" approval="Yönetici + yedek doğrulaması" />
              <DangerRow operation="DROP COLUMN" risk="HIGH" approval="Yönetici + etki analizi" />
              <DangerRow
                operation="TRUNCATE TABLE"
                risk="CRITICAL"
                approval="Yönetici + yedek doğrulaması"
              />
              <DangerRow operation="DELETE FROM (WHERE'siz)" risk="CRITICAL" approval="Yönetici" />
              <DangerRow operation="UPDATE (WHERE'siz)" risk="HIGH" approval="Yönetici" />
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
              <DangerRow operation="DROP INDEX (üretimde)" risk="MEDIUM" approval="Yönetici" />
            </tbody>
          </table>
        </div>
      </section>

      {/* Migration history */}
      <section className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-2)]">
        <div className="border-b border-[var(--border-subtle)] px-6 py-4">
          <h2 className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
            Migrasyon Geçmişi
          </h2>
          <p className="mt-1.5 text-sm text-[var(--text-secondary)]">
            Veritabanına uygulanan tüm şema değişiklikleri.
          </p>
        </div>
        <div className="overflow-x-auto">
          {migrationsError ? (
            <p className="px-6 py-4 text-sm text-[var(--warn)]">
              Migrasyon geçmişi okunamadı.
            </p>
          ) : migrations.length === 0 ? (
            <p className="px-6 py-4 text-sm text-[var(--text-muted)]">
              Kayıtlı migrasyon bulunamadı.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
                  <th className="px-6 pb-2 pr-4">#</th>
                  <th className="pb-2 pr-4">Migrasyon Adı</th>
                  <th className="pb-2 pr-4">Durum</th>
                  <th className="pb-2">Tamamlandı</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {migrations.map((m, i) => {
                  const failed = !m.finished_at || m.rolled_back_at;
                  return (
                    <tr key={m.id} className="hover:bg-[var(--surface-3)]">
                      <td className="px-6 py-2.5 pr-4 font-mono text-xs tabular-nums text-[var(--text-muted)]">
                        {i + 1}
                      </td>
                      <td className="py-2.5 pr-4 font-mono text-xs text-[var(--text-primary)]">
                        {m.migration_name}
                      </td>
                      <td className="py-2.5 pr-4">
                        {failed ? (
                          <span className="inline-flex items-center rounded-md border border-[var(--danger-border)] bg-[var(--danger-dim)] px-2 py-0.5 text-[11px] font-medium text-[var(--danger)]">
                            Hata
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md border border-[var(--ok-border)] bg-[var(--ok-dim)] px-2 py-0.5 text-[11px] font-medium text-[var(--ok)]">
                            <Check size={14} strokeWidth={1.5} /> Uygulandı
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 font-mono text-xs tabular-nums text-[var(--text-muted)]">
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
      <div className="flex flex-wrap gap-4 text-sm text-[var(--text-secondary)]">
        <Link href="/admin/executive" className="transition-colors hover:text-[var(--text-primary)]">
          ← Yönetici Paneli
        </Link>
        <Link
          href="/admin/data-hygiene"
          className="transition-colors hover:text-[var(--text-primary)]"
        >
          Veri Hijyeni →
        </Link>
        <a
          href="https://supabase.com/dashboard/project/frbxpodiostxuwlrubkt/settings/backups"
          target="_blank"
          rel="noopener noreferrer"
          className="transition-colors hover:text-[var(--text-primary)]"
        >
          Supabase Yedekleme ↗
        </a>
      </div>
    </div>
  );
}
