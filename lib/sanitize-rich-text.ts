import "server-only";

import sanitizeHtml from "sanitize-html";

/**
 * Tiptap/XML kaynaklı zengin metin için allowlist sanitizer (S-O2).
 *
 * `product.description` iki yerden geliyor: Tiptap editörü (yetkili kullanıcı) ve
 * tedarikçi XML feed'i (`<aciklama>`, lib/xml-sync-runner.ts → yeni ürün bootstrap).
 * İkincisi dış kaynak olduğu için render öncesi her zaman temizlenir. Allowlist,
 * Tiptap StarterKit + Link eklentisinin ürettiği etiketlerle sınırlıdır.
 */
export function sanitizeRichText(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      "p", "br", "strong", "b", "em", "i", "u", "s", "code", "pre",
      "h1", "h2", "h3", "h4", "ul", "ol", "li", "blockquote", "hr", "a",
    ],
    allowedAttributes: {
      a: ["href", "target", "rel"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    // target=_blank linklere rel eklenir; javascript: vb. şemalar zaten reddedilir.
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer nofollow" }),
    },
    disallowedTagsMode: "discard",
  });
}
