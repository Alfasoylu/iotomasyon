"use client";

import { useRouter } from "next/navigation";
import { startTransition, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { loginAction } from "@/lib/actions/auth-actions";
import { loginSchema, type LoginInput } from "@/lib/validations/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function LoginForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string>();
  const [isPending, setIsPending] = useState(false);

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    setServerError(undefined);
    setIsPending(true);

    startTransition(async () => {
      const result = await loginAction(values);
      setIsPending(false);

      if (!result.ok) {
        setServerError(result.message);

        for (const [fieldName, errors] of Object.entries(result.fieldErrors ?? {})) {
          if (!errors?.length) {
            continue;
          }

          form.setError(fieldName as keyof LoginInput, {
            message: errors[0],
          });
        }

        return;
      }

      router.push(result.redirectTo ?? "/dashboard");
      router.refresh();
    });
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="email" className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
          E-posta
        </label>
        <Input id="email" type="email" autoComplete="email" {...form.register("email")} />
        {form.formState.errors.email?.message ? (
          <p className="text-[12px] text-[var(--danger)]">{form.formState.errors.email.message}</p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="password" className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
          Şifre
        </label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          {...form.register("password")}
        />
        {form.formState.errors.password?.message ? (
          <p className="text-[12px] text-[var(--danger)]">{form.formState.errors.password.message}</p>
        ) : null}
      </div>

      {serverError ? (
        <p className="rounded-md border border-[var(--danger-border)] bg-[var(--danger-dim)] px-3 py-2 text-[12px] text-[var(--danger)]">
          {serverError}
        </p>
      ) : null}

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "Giriş yapılıyor..." : "Giriş yap"}
      </Button>
    </form>
  );
}
