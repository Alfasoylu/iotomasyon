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
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="space-y-2">
        <label htmlFor="email" className="text-sm font-medium text-slate-700">
          E-posta
        </label>
        <Input id="email" type="email" autoComplete="email" {...form.register("email")} />
        <p className="text-sm text-red-600">{form.formState.errors.email?.message}</p>
      </div>

      <div className="space-y-2">
        <label htmlFor="password" className="text-sm font-medium text-slate-700">
          Şifre
        </label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          {...form.register("password")}
        />
        <p className="text-sm text-red-600">{form.formState.errors.password?.message}</p>
      </div>

      {serverError ? <p className="text-sm text-red-600">{serverError}</p> : null}

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "Giriş yapılıyor..." : "Giriş yap"}
      </Button>
    </form>
  );
}
