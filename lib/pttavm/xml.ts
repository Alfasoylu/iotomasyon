// Küçük, bağımlılıksız XML → nesne dönüştürücü (yalnız PttAVM SOAP yanıtları için). Ad alanı önekleri atılır, öznitelikler yok
// sayılır (i:nil="true" → null), aynı adlı kardeşler diziye toplanır, yalnız metin içeren eleman string olur.
export type XmlNode = string | null | { [k: string]: XmlNode | XmlNode[] };

const decode = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&amp;/g, "&");
const local = (name: string) => name.slice(name.indexOf(":") + 1);
export const escapeXml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

export function parseXml(xml: string): XmlNode {
  const src = xml.replace(/<\?xml[^>]*\?>/g, "").replace(/<!--[\s\S]*?-->/g, "");
  const re = /<(\/?)([A-Za-z_][\w.:-]*)((?:\s+[^\s=>/]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|<!\[CDATA\[([\s\S]*?)\]\]>|([^<]+)/g;
  type Frame = { name: string; children: [string, XmlNode][]; text: string; nil: boolean };
  const root: Frame = { name: "#root", children: [], text: "", nil: false };
  const stack: Frame[] = [root];
  const build = (f: Frame): XmlNode => {
    if (f.nil) return null;
    if (!f.children.length) return decode(f.text.trim());
    const o: { [k: string]: XmlNode | XmlNode[] } = {};
    for (const [k, v] of f.children) {
      const cur = o[k];
      if (cur === undefined) o[k] = v; else if (Array.isArray(cur)) cur.push(v); else o[k] = [cur, v];
    }
    return o;
  };
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const top = stack[stack.length - 1];
    if (m[5] !== undefined) { top.text += m[5]; continue; }
    if (m[6] !== undefined) { top.text += m[6]; continue; }
    const name = local(m[2]);
    if (m[1]) {
      const f = stack.pop()!;
      if (f.name !== name) throw new Error(`XML kapanış etiketi uyuşmuyor: ${f.name} ≠ ${name}`);
      stack[stack.length - 1].children.push([name, build(f)]);
    } else {
      const nil = /\bnil\s*=\s*["']true["']/.test(m[3] ?? "");
      const f: Frame = { name, children: [], text: "", nil };
      if (m[4]) top.children.push([name, build(f)]); else stack.push(f);
    }
  }
  if (stack.length !== 1) throw new Error("XML kapanmamış eleman");
  return build(root);
}

/** Yoldaki elemanı bulur (ad alanı öneksiz); dizi ise ilkini izler. */
export function pick(node: XmlNode | XmlNode[] | undefined, ...path: string[]): XmlNode | XmlNode[] | undefined {
  let cur: XmlNode | XmlNode[] | undefined = node;
  for (const p of path) {
    if (Array.isArray(cur)) cur = cur[0];
    if (cur == null || typeof cur === "string") return undefined;
    cur = cur[p];
  }
  return cur;
}
export const asArray = <T,>(v: T | T[] | undefined | null): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);
