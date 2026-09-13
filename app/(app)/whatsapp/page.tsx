import { MessageSquare, Clock, CircleAlert, CheckCircle2, Send } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/layout/empty-state";
import { KpiCard } from "@/components/layout/kpi-card";
import { PageHeader } from "@/components/layout/page-header";
import { requireUser, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { formatTime, formatDays } from "@/lib/whatsapp/schedule";
import { formatDateTime } from "@/lib/utils";
import {
  getWhatsAppStats,
  listAwaitingReply,
  listContacts,
  listRecentThreads,
  listSchedules,
} from "@/services/whatsapp-service";
import { AddContactButton } from "./_components/contact-form";
import { AddScheduleButton } from "./_components/schedule-form";
import { RunSchedulesButton } from "./_components/run-schedules-button";

export const dynamic = "force-dynamic";

export default async function WhatsAppPage() {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.WHATSAPP_READ))) {
    return (
      <EmptyState
        icon={CircleAlert}
        title="Bu sayfa için yetkiniz yok"
        hint="WhatsApp mesaj merkezi için `whatsapp.read` izni gerekir."
      />
    );
  }

  const gonderebilir = await checkPermission(user, PERMISSIONS.WHATSAPP_SEND);
  const yonetebilir = await checkPermission(user, PERMISSIONS.WHATSAPP_MANAGE);

  const [stats, bekleyenler, gorevler, kisiler, akis] = await Promise.all([
    getWhatsAppStats(),
    listAwaitingReply(),
    listSchedules(),
    listContacts(),
    listRecentThreads(30),
  ]);

  // Kurulum eksikse bunu SÖYLE. Anahtar yokken sayfa gayet normal görünür,
  // görevler "aktif" yazar ve hiçbir mesaj gitmez — eksiklik ancak "mesaj hiç
  // gelmedi" ile fark edilirdi.
  const yapilandirildi = Boolean(
    process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID
  );
  const webhookHazir = Boolean(process.env.WHATSAPP_APP_SECRET);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={MessageSquare}
        breadcrumb={[{ label: "Sistem" }, { label: "WhatsApp" }]}
        title="WhatsApp Mesaj Merkezi"
        subtitle="Zamanlanmış mesajlar, gelen cevaplar ve kişi listesi. Cevabı gelmemiş sorular en üstte."
        actions={gonderebilir ? <RunSchedulesButton /> : undefined}
      />

      {(!yapilandirildi || !webhookHazir) && (
        <Card className="border-[var(--warn)] p-4">
          <div className="flex gap-3">
            <CircleAlert size={18} className="mt-0.5 shrink-0 text-[var(--warn)]" />
            <div className="space-y-1 text-sm">
              <p className="font-medium">Kurulum tamamlanmadı</p>
              {!yapilandirildi && (
                <p className="text-[var(--text-secondary)]">
                  <code>WHATSAPP_TOKEN</code> ve <code>WHATSAPP_PHONE_NUMBER_ID</code> tanımlı
                  değil — <strong>hiçbir mesaj gönderilmiyor</strong>.
                </p>
              )}
              {!webhookHazir && (
                <p className="text-[var(--text-secondary)]">
                  <code>WHATSAPP_APP_SECRET</code> tanımlı değil — webhook 503 döner,{" "}
                  <strong>gelen cevaplar kaydedilmiyor</strong>.
                </p>
              )}
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Aktif kişi" value={String(stats.kisi)} />
        <KpiCard label="Aktif görev" value={String(stats.aktifGorev)} />
        <KpiCard
          label="Cevap bekleyen"
          value={String(stats.bekleyen)}
          tone={stats.bekleyen > 0 ? "warning" : "neutral"}
          hint="Soruldu, cevabı gelmedi"
        />
        <KpiCard label="Son 24 saatte giden" value={String(stats.bugunGiden)} />
      </div>

      {/* ── Cevap bekleyenler: panelin asıl iş listesi ─────────────────── */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
          <Clock size={14} /> Cevap bekleyenler
        </h2>
        {bekleyenler.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title="Cevapsız soru yok"
            hint="Gönderilen her soruya cevap gelmiş görünüyor."
          />
        ) : (
          <Card className="divide-y divide-[var(--border-subtle)]">
            {bekleyenler.map((m) => (
              <div key={m.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{m.contact.name}</span>
                    {m.schedule && <Badge variant="info">{m.schedule.name}</Badge>}
                  </div>
                  <p className="text-sm text-[var(--text-secondary)]">{m.body}</p>
                </div>
                <span className="shrink-0 text-xs tabular-nums text-[var(--text-tertiary)]">
                  {formatDateTime(m.createdAt)}
                </span>
              </div>
            ))}
          </Card>
        )}
      </section>

      {/* ── Zamanlanmış görevler ───────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            Zamanlanmış mesajlar
          </h2>
          {yonetebilir && (
            <AddScheduleButton
              contacts={kisiler.map((k) => ({ id: k.id, name: k.name, isActive: k.isActive }))}
            />
          )}
        </div>
        {gorevler.length === 0 ? (
          <EmptyState
            icon={Clock}
            title="Zamanlanmış görev yok"
            hint="Örnek: depo ekibine her sabah 08:30'da 'işe başladınız mı?'"
          />
        ) : (
          <Card className="divide-y divide-[var(--border-subtle)]">
            {gorevler.map((g) => (
              <div key={g.id} className="space-y-2 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{g.name}</span>
                  <Badge variant={g.isActive ? "ok" : "neutral"}>
                    {g.isActive ? "Aktif" : "Pasif"}
                  </Badge>
                  <span className="text-sm tabular-nums text-[var(--text-secondary)]">
                    {formatTime(g.hour, g.minute)} · {formatDays(g.daysOfWeek)}
                  </span>
                  {g.templateName ? (
                    <Badge variant="info">şablon: {g.templateName}</Badge>
                  ) : (
                    // Serbest metin yalnız 24 saatlik pencerede gider; işletme
                    // başlatımlı sabah mesajında o pencere KAPALIDIR.
                    <Badge variant="warn">serbest metin — pencere şartı</Badge>
                  )}
                </div>
                <p className="text-sm text-[var(--text-secondary)]">{g.body}</p>
                <p className="text-xs text-[var(--text-tertiary)]">
                  Alıcı: {g.recipients.map((r) => r.contact.name).join(", ") || "—"}
                  {g.lastRunOn && ` · son çalışma: ${g.lastRunOn}`}
                </p>
              </div>
            ))}
          </Card>
        )}
      </section>

      {/* ── Son mesajlar: soru ve cevabı YAN YANA ──────────────────────── */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
          <Send size={14} /> Son gönderilenler ve cevapları
        </h2>
        {akis.giden.length === 0 ? (
          <EmptyState icon={MessageSquare} title="Henüz mesaj gönderilmedi" />
        ) : (
          <Card className="divide-y divide-[var(--border-subtle)]">
            {akis.giden.map((m) => (
              <div key={m.id} className="space-y-2 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{m.contact.name}</span>
                    {m.schedule && <Badge variant="info">{m.schedule.name}</Badge>}
                    {m.status === "failed" && <Badge variant="danger">gönderilemedi</Badge>}
                  </div>
                  <span className="text-xs tabular-nums text-[var(--text-tertiary)]">
                    {formatDateTime(m.createdAt)}
                  </span>
                </div>
                <p className="text-sm">{m.body}</p>
                {m.error && <p className="text-xs text-[var(--danger)]">{m.error}</p>}
                {m.reply ? (
                  <div className="rounded-md border-l-2 border-[var(--ok)] bg-[var(--surface-3)] p-3">
                    <p className="text-sm">{m.reply.body}</p>
                    <p className="mt-1 text-xs tabular-nums text-[var(--text-tertiary)]">
                      cevap · {formatDateTime(m.reply.createdAt)}
                    </p>
                  </div>
                ) : m.awaitingReply ? (
                  <p className="text-xs text-[var(--warn)]">cevap bekleniyor</p>
                ) : null}
              </div>
            ))}
          </Card>
        )}
      </section>

      {/* Bir soruya bağlanamayan gelen mesajlar — kaybolmasınlar. */}
      {akis.bagsizGelen.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            Bağımsız gelen mesajlar
          </h2>
          <Card className="divide-y divide-[var(--border-subtle)]">
            {akis.bagsizGelen.map((m) => (
              <div key={m.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <span className="font-medium">{m.contact.name}</span>
                  <p className="text-sm text-[var(--text-secondary)]">{m.body}</p>
                </div>
                <span className="shrink-0 text-xs tabular-nums text-[var(--text-tertiary)]">
                  {formatDateTime(m.createdAt)}
                </span>
              </div>
            ))}
          </Card>
        </section>
      )}

      {/* ── Kişiler ────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            Kişiler
          </h2>
          {yonetebilir && <AddContactButton />}
        </div>
        {kisiler.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title="Kayıtlı kişi yok"
            hint="Tanımadığı numaradan gelen mesaj kaydedilmez — önce kişi eklenmeli."
            action={yonetebilir ? <AddContactButton /> : undefined}
          />
        ) : (
          <Card className="divide-y divide-[var(--border-subtle)]">
            {kisiler.map((k) => (
              <div key={k.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{k.name}</span>
                    {k.label && <Badge variant="neutral">{k.label}</Badge>}
                    {!k.isActive && <Badge variant="neutral">pasif</Badge>}
                  </div>
                  <p className="text-sm tabular-nums text-[var(--text-secondary)]">+{k.phone}</p>
                </div>
                <div className="text-right text-xs text-[var(--text-tertiary)]">
                  <p>{k._count.messages} mesaj · {k._count.schedules} görev</p>
                  <p className={k.pencereAcik ? "text-[var(--ok)]" : undefined}>
                    {k.pencereAcik
                      ? "24 saatlik pencere AÇIK — serbest metin gider"
                      : "pencere kapalı — yalnız onaylı şablon"}
                  </p>
                </div>
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}
