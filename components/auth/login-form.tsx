"use client";

import { useRouter } from "next/navigation";
import { startTransition, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { loginAction } from "@/lib/actions/auth-actions";
import type { CaptchaChallenge } from "@/lib/captcha";
import { loginSchema, type LoginInput } from "@/lib/validations/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ImageCaptcha } from "@/components/auth/image-captcha";
import { TurnstileWidget } from "@/components/auth/turnstile-widget";

type Props = {
  /** Cloudflare Turnstile anahtarı tanımlıysa onun widget'ı gösterilir. */
  captchaSiteKey?: string;
  /** Turnstile yoksa yerleşik resim CAPTCHA'sı (sunucuda üretilir). */
  imageCaptcha?: CaptchaChallenge;
};

export function LoginForm({ captchaSiteKey, imageCaptcha }: Props) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string>();
  const [isPending, setIsPending] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(imageCaptcha?.token ?? null);
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  // Token tek kullanımlık: her başarısız denemede widget/resim yenilenir.
  const [captchaEpoch, setCaptchaEpoch] = useState(0);
  const useTurnstile = Boolean(captchaSiteKey);
  const useImage = !useTurnstile && Boolean(imageCaptcha);

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    setServerError(undefined);

    if (useTurnstile && !captchaToken) {
      setServerError("Lütfen robot olmadığınızı doğrulayın.");
      return;
    }
    if (useImage && captchaAnswer.length !== 5) {
      setServerError("Lütfen resimdeki 5 rakamı girin.");
      return;
    }

    setIsPending(true);

    startTransition(async () => {
      const result = await loginAction({
        ...values,
        captchaToken: captchaToken ?? undefined,
        captchaAnswer: useImage ? captchaAnswer : undefined,
      });
      setIsPending(false);

      if (!result.ok) {
        setServerError(result.message);

        for (const [fieldName, errors] of Object.entries(result.fieldErrors ?? {})) {
          if (!errors?.length) {
            continue;
          }

          if (fieldName === "captchaToken" || fieldName === "captchaAnswer") {
            if (useTurnstile) setCaptchaToken(null);
            setCaptchaAnswer("");
            setCaptchaEpoch((n) => n + 1);
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

      {useTurnstile && captchaSiteKey ? (
        <div className="space-y-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
            Güvenlik doğrulaması
          </span>
          <TurnstileWidget
            key={captchaEpoch}
            siteKey={captchaSiteKey}
            onToken={setCaptchaToken}
            className="min-h-[65px]"
          />
        </div>
      ) : null}

      {useImage && imageCaptcha ? (
        <div className="space-y-1.5">
          <label htmlFor="captcha" className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
            Güvenlik doğrulaması
          </label>
          <ImageCaptcha
            initial={imageCaptcha}
            refreshSignal={captchaEpoch}
            tone="dark"
            inputId="captcha"
            onChange={({ token, answer }) => {
              setCaptchaToken(token);
              setCaptchaAnswer(answer);
            }}
          />
        </div>
      ) : null}

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
