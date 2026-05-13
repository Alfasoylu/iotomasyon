import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/login-form";
import { Card } from "@/components/ui/card";
import { getCurrentSession } from "@/lib/auth";

export default async function LoginPage() {
  const user = await getCurrentSession();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="grid w-full max-w-5xl gap-6 lg:grid-cols-[1.2fr_0.9fr]">
        <section className="rounded-[2rem] border border-[color:var(--border)] bg-slate-950 px-8 py-10 text-white shadow-2xl">
          <p className="text-sm uppercase tracking-[0.4em] text-white/60">Iotomasyon</p>
          <h1 className="mt-6 max-w-lg text-4xl font-semibold leading-tight">
            Elektronik urun, musteri ve stok akisini tek merkezden yonetin.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-slate-300">
            Phase 1 icin sistem tek admin hesabi ile calisir. Giris yaptiktan sonra
            dashboard ve urun modulu kullanima hazirdir.
          </p>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            <Metric label="Modul" value="Auth + Dashboard + Products" />
            <Metric label="Altyapi" value="Next 16 + Prisma + PostgreSQL" />
            <Metric label="Hazirlik" value="PostgreSQL migration-ready" />
          </div>
        </section>

        <Card className="p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
            Admin login
          </p>
          <h2 className="mt-4 text-3xl font-semibold text-slate-950">Giris yap</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Ilk giriste sistem `ADMIN_EMAIL` ve `ADMIN_PASSWORD` bilgileri ile admin
            hesabini otomatik olusturur.
          </p>
          <div className="mt-8">
            <LoginForm />
          </div>
        </Card>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <p className="text-xs uppercase tracking-[0.3em] text-white/50">{label}</p>
      <p className="mt-3 text-sm font-medium text-white">{value}</p>
    </div>
  );
}
