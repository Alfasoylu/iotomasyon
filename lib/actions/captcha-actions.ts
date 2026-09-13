"use server";

import { createCaptchaChallenge, type CaptchaChallenge } from "@/lib/captcha";

/** İstemcinin "yenile" tuşu ve başarısız denemeden sonra yeni resim alması için. */
export async function refreshCaptchaAction(): Promise<CaptchaChallenge> {
  return createCaptchaChallenge();
}
