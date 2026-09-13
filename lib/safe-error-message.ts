/**
 * Güvenli hata mesajı yardımcıları.
 *
 * Beklenmedik hatalar (Prisma, upstream API, dosya sistemi vb.) içerdikleri
 * teknik detaylarla (tablo/sütun adı, bağlantı dizesi, upstream gövdesi)
 * istemciye SIZDIRILMAMALIDIR. Bu modül:
 *
 *   - `UserFacingError` : mesajı bilinçli olarak kullanıcıya gösterilmek üzere
 *                         yazılmış hatalar için işaretleyici sınıf.
 *   - `userFacingMessage(err, fallback)` : yalnız `UserFacingError` örneklerinin
 *                         mesajını döner; diğer her şey için `fallback` döner ve
 *                         gerçek hatayı sunucu tarafında `console.error` ile loglar.
 *
 * Kullanım:
 *   catch (err) {
 *     return { ok: false, message: userFacingMessage(err, "İşlem başarısız oldu.") };
 *   }
 */

export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserFacingError";
  }
}

/**
 * Kullanıcıya gösterilebilecek mesajı döner. `UserFacingError` değilse gerçek
 * hata sunucu loguna yazılır ve `fallback` döner.
 *
 * @param context Log satırında hatanın kaynağını ayırt etmek için kısa etiket.
 */
export function userFacingMessage(err: unknown, fallback: string, context?: string): string {
  if (err instanceof UserFacingError) return err.message;
  console.error(context ? `[${context}]` : "[userFacingMessage]", err);
  return fallback;
}
