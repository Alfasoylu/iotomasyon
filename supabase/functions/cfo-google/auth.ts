// cfo-google Edge Function yetkilendirmesi: yalnız sunucu-içi paylaşılan sır (x-cfo-internal) kabul edilir.
// Supabase anon/authenticated JWT'si TEK BAŞINA yetki DEĞİLDİR (anon key herkese açıktır).
export function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder(), x = enc.encode(a), y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}
export const MIN_TOKEN_LENGTH = 32;
export function isAuthorized(provided: string | null | undefined, expected: string | null | undefined): boolean {
  if (!provided || !expected || expected.length < MIN_TOKEN_LENGTH) return false;
  return timingSafeEqual(provided, expected);
}
