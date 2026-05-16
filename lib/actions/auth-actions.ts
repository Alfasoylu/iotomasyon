"use server";

import type { ActionResult } from "@/types/actions";
import { authenticateWithPassword, clearUserSession, createUserSession } from "@/lib/auth";
import { loginSchema, type LoginInput } from "@/lib/validations/auth";

export async function loginAction(values: LoginInput): Promise<ActionResult<keyof LoginInput>> {
  const parsed = loginSchema.safeParse(values);

  if (!parsed.success) {
    return {
      ok: false,
      message: "Form alanlarını kontrol edin.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const user = await authenticateWithPassword(parsed.data.email, parsed.data.password);

  if (!user) {
    return {
      ok: false,
      message: "E-posta veya şifre hatalı.",
    };
  }

  await createUserSession({
    userId: user.id,
    email: user.email,
    role: user.role as string,
  });

  return {
    ok: true,
    redirectTo: "/dashboard",
  };
}

export async function logoutAction() {
  await clearUserSession();
}
