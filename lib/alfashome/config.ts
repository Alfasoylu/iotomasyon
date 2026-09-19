/**
 * ALFAS Home bağlantı ayarı — adres + salt okunur CRM jetonu.
 *
 * İKİ KAYNAK, BELİRLİ SIRA:
 *   1. **Veritabanı** (`AlfashomeConfig`, panelden girilir) — öncelikli.
 *   2. **Env** (`ALFASHOME_API_URL` / `ALFASHOME_API_TOKEN`) — yedek.
 *
 * NEDEN VERİTABANI ÖNCE: Trendyol/Hepsiburada kimlik bilgileri de veritabanında
 * (aynı mimari). Env'e yazmak Vercel paneline girmeyi ve her değişiklikte
 * yeniden dağıtım beklemeyi gerektiriyor; panelden kaydedilen değer ANINDA
 * geçerli oluyor. Env desteği kaldırılmadı ki mevcut kurulumlar bozulmasın.
 *
 * ⚠️ JETON BUNDAN SONRA İSTEMCİYE GİTMEZ. Sayfa/form yalnız `tokenVar` ve son
 * 4 hane görür (`tokenIpucu`). Trendyol formu kayıtlı anahtarı `initialValues`
 * ile tarayıcıya geri basıyor; bu dosyada o desen BİLEREK tekrarlanmadı —
 * sırrı her sayfa görüntülemesinde HTML'e gömmek gereksiz bir sızıntı yüzeyi.
 *
 * ⚠️ `isEnabled` false ise veritabanı kaydı YOK SAYILIR ve env'e düşülür:
 * "kapat" düğmesi gerçekten kapatmalı, yarım yapılandırmayla çalışmaya devam
 * etmemeli.
 */

export type AlfasBaglanti = {
  baseUrl: string;
  token: string;
  /** Değerin nereden geldiği — panelde gösteriliyor (teşhis). */
  kaynak: "panel" | "env" | null;
};

const temizUrl = (v: unknown) => String(v ?? "").trim().replace(/\/+$/, "");
const temiz = (v: unknown) => String(v ?? "").trim();

/** Env'deki değerler (yedek kaynak). */
export function envBaglanti(): { baseUrl: string; token: string } {
  return {
    baseUrl: temizUrl(process.env.ALFASHOME_API_URL),
    token: temiz(process.env.ALFASHOME_API_TOKEN),
  };
}

/**
 * Etkin bağlantı ayarı. Veritabanına erişilemezse (migration yok, DB kapalı)
 * env'e düşer — panel bu yüzden hiç açılmaz hâle gelmesin.
 */
export async function alfasBaglanti(): Promise<AlfasBaglanti> {
  let kayit: { baseUrl: string; token: string; isEnabled: boolean } | null = null;
  try {
    // Prisma GEÇ (lazy) import ediliyor: bu modül testlerden de import ediliyor
    // ve orada veritabanı yok. Üst seviyede import etmek testi DB'ye bağımlı
    // kılardı; hata da "yapılandırma yok" gibi değil, çökme gibi görünürdü.
    const { prisma } = await import("@/lib/prisma");
    kayit = await prisma.alfashomeConfig.findUnique({
      where: { id: "singleton" },
      select: { baseUrl: true, token: true, isEnabled: true },
    });
  } catch {
    // Tablo yok / DB erişilemedi → env yedeğiyle devam.
  }

  if (kayit?.isEnabled) {
    const baseUrl = temizUrl(kayit.baseUrl);
    const token = temiz(kayit.token);
    if (baseUrl && token) return { baseUrl, token, kaynak: "panel" };
  }

  const env = envBaglanti();
  if (env.baseUrl && env.token) return { ...env, kaynak: "env" };

  return { baseUrl: "", token: "", kaynak: null };
}

/** Jetonun son 4 hanesi — panelde "kayıtlı" göstergesi için. Tamamı DÖNMEZ. */
export function tokenIpucu(token: string): string {
  const t = temiz(token);
  if (t.length < 8) return "••••";
  return `••••${t.slice(-4)}`;
}
