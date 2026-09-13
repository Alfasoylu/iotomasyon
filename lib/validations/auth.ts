import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Valid bir e-posta girin."),
  password: z.string().min(8, "Sifre en az 8 karakter olmali."),
  // Cloudflare Turnstile token'ı. Sunucu, CAPTCHA açıkken varlığını zorunlu kılar
  // (lib/actions/auth-actions.ts); şema düzeyinde opsiyonel ki CAPTCHA kapalıyken
  // form bozulmasın.
  captchaToken: z.string().max(2048).optional(),
  // Yerleşik resim CAPTCHA'sının cevabı (lib/captcha.ts); Turnstile yoksa zorunlu.
  captchaAnswer: z.string().max(16).optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
