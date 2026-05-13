import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Valid bir e-posta girin."),
  password: z.string().min(8, "Sifre en az 8 karakter olmali."),
});

export type LoginInput = z.infer<typeof loginSchema>;
