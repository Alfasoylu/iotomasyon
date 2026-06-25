import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/login-form";
import { Card } from "@/components/ui/card";
import { getCurrentSession } from "@/lib/auth";
import { COMPANY_SETTINGS } from "@/lib/company-settings";

export const metadata: Metadata = {
  title: "Yönetici Girişi",
  robots: { index: false, follow: false },
};

export default async function LoginPage() {
  const user = await getCurrentSession();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10 bg-[var(--surface-0)]">
      <div className="grid w-full max-w-5xl gap-6 lg:grid-cols-[1.2fr_0.9fr]">
        <section className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-1)] px-8 py-10">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-md bg-[var(--accent)] text-[var(--accent-fg)] text-[16px] font-bold">
              AS
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-medium">İotomasyon CRM</p>
              <p className="text-[14px] font-semibold tracking-tight text-[var(--text-primary)]">{COMPANY_SETTINGS.companyName}</p>
            </div>
          </div>
          <h1 className="mt-8 max-w-lg text-[28px] font-semibold leading-tight tracking-tight text-[var(--text-primary)]">
            Müşteri, teklif ve görev yönetimini tek merkezden yönetin.
          </h1>
          <p className="mt-4 max-w-xl text-[14px] leading-6 text-[var(--text-secondary)]">
            Güvenlik kameraları ve elektronik sistemler için özel CRM. Müşteri takibi, teklif hazırlama,
            görev planlaması ve kampanya yönetimi tek ekranda.
          </p>
          <div className="mt-8 grid gap-3 md:grid-cols-3">
            <Metric label="Müşteri" value="Takip + Pipeline + Segmentasyon" />
            <Metric label="Teklif" value="PDF + Durum + Revizyon" />
            <Metric label="Görev" value="Ekip + Öncelik + Hatırlatıcı" />
          </div>
        </section>

        <Card className="p-8">
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
            Admin login
          </p>
          <h2 className="mt-3 text-[22px] font-semibold tracking-tight text-[var(--text-primary)]">Giriş yap</h2>
          <p className="mt-2 text-[13px] leading-6 text-[var(--text-secondary)]">
            İlk girişte sistem <code className="rounded bg-[var(--surface-3)] px-1 py-0.5 text-[12px] font-mono text-[var(--text-primary)]">ADMIN_EMAIL</code> ve <code className="rounded bg-[var(--surface-3)] px-1 py-0.5 text-[12px] font-mono text-[var(--text-primary)]">ADMIN_PASSWORD</code> ile admin hesabını otomatik oluşturur.
          </p>
          <div className="mt-6">
            <LoginForm />
          </div>
        </Card>
      </div>
      <Image src={COMPANY_SETTINGS.logoUrl} alt="" width={1} height={1} className="hidden" />
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[var(--border-default)] bg-[var(--surface-2)] p-3">
      <p className="text-[10px] uppercase tracking-widest font-medium text-[var(--text-muted)]">{label}</p>
      <p className="mt-2 text-[12px] font-medium text-[var(--text-secondary)]">{value}</p>
    </div>
  );
}
