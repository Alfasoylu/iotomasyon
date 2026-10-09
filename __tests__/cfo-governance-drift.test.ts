import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

// CFO-GOVERNANCE-DRIFT (Alperen 2026-10-09): her merge öncesi beş yönetişim belgesinin durum alanları birbiriyle ve gerçek
// main durumuyla tutarlı olmalı; değilse CI FAIL. Alanlar her belgenin frontmatter'ında (--- … ---):
//   current_main_commit · current_score · current_phase · next_action · open_critical · open_high · score_change
// Kontroller:
//   1) Beş belgede alanların hepsi var ve değerleri BİREBİR aynı.
//   2) current_main_commit = gerçek main: PR CI'da birleştirme ref'inin ilk ebeveyni (HEAD^1 = güncel main ucu), main'e push'ta
//      HEAD^1 (squash öncesi main), diğer dallarda/yerelde merge-base(HEAD, origin/main). GOVERNANCE_MAIN_SHA ile ezilebilir.
//   3) open_critical / open_high = CFO-RED-FLAGS.md "Durum kaydı" tablosundan sayılan (RESOLVED dışı) CRITICAL / HIGH; kayıtta her
//      RF kaydı var; bir "— güncelleme: RESOLVED" başlığı olan kayıt RESOLVED dışında olamaz.
//   4) current_score = CFO-SCORECARD.md puan tablosunun TOPLAM'ı ve boyut puanlarının toplamı; skor geçmişinin son satırı
//      current_main_commit'i ve aynı skoru taşır.
//   5) score_change: main'deki skora göre — değişmediyse "unchanged — <gerekçe>" (bilinçli olduğu kayıtlı), değiştiyse
//      "<eski>→<yeni> — <gerekçe>".
//   6) current_phase "Faz N — …" ve N, CFO-MASTER-PLAN.md faz tablosunda; next_action en az bir açık (TAMAMLANDI olmayan) CFO-### maddesi.
// Çalıştır: node --import tsx __tests__/cfo-governance-drift.test.ts

export const GOVERNANCE_DOCS = ["CFO-MASTER-PLAN.md", "CFO-BACKLOG.md", "CFO-SCORECARD.md", "CFO-RED-FLAGS.md", "CFO-DECISION-LOG.md"] as const;
export const GOVERNANCE_FIELDS = ["current_main_commit", "current_score", "current_phase", "next_action", "open_critical", "open_high", "score_change"] as const;

export function frontmatter(md: string): Record<string, string> {
  const m = md.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return {};
  const out: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^([a-z_]+):\s*(.*)$/);
    if (kv) out[kv[1]] = kv[2].trim().replace(/^"(.*)"$/, "$1");
  }
  return out;
}

export const scoreOf = (v: string | undefined) => { const m = v?.match(/^(\d+)\s*\/\s*100\b/); return m ? Number(m[1]) : null; };

/** "Durum kaydı" tablosu: | RF-… | SEVERITY | STATUS | not | */
export function redFlagRegister(md: string): Map<string, { severity: string; status: string }> {
  const sec = md.split(/^## Durum kaydı/m)[1]?.split(/^## /m)[0] ?? "";
  const reg = new Map<string, { severity: string; status: string }>();
  for (const m of sec.matchAll(/^\|\s*(RF-\d{8}-\d{3})\s*\|\s*([A-Z]+)\s*\|\s*([A-Z_]+)\s*\|/gm)) reg.set(m[1], { severity: m[2], status: m[3] });
  return reg;
}

export function openCounts(reg: Map<string, { severity: string; status: string }>) {
  const open = [...reg.values()].filter(r => r.status !== "RESOLVED");
  return { critical: open.filter(r => r.severity === "CRITICAL").length, high: open.filter(r => r.severity === "HIGH").length };
}

/** Puan tablosu: boyut satırları (| n | ad | ağırlık | **puan** |) ve TOPLAM satırı. */
export function scorecardTotals(md: string) {
  const dims = [...md.matchAll(/^\|\s*(\d+)\s*\|[^|]+\|\s*(\d+)\s*\|\s*\*\*(\d+)\*\*\s*\|/gm)].map(m => ({ dim: Number(m[1]), weight: Number(m[2]), points: Number(m[3]) }));
  const total = md.match(/^\|\s*\|\s*\*\*TOPLAM\*\*\s*\|\s*\*\*100\*\*\s*\|\s*\*\*(\d+)\*\*/m);
  const history = (md.split(/^## Skor geçmişi/m)[1] ?? "").split("\n").filter(l => /^\|\s*\d{4}-\d{2}-\d{2}/.test(l));
  return { dims, total: total ? Number(total[1]) : null, lastHistory: history[history.length - 1] ?? null };
}

export function checkScoreChange(scoreChange: string, baseScore: number | null, current: number): string | null {
  if (baseScore == null) return /^(unchanged|\d+→\d+) — .{15,}/.test(scoreChange) ? null : "score_change biçimi: 'unchanged — <gerekçe>' ya da '<eski>→<yeni> — <gerekçe>'";
  if (baseScore === current)
    return /^unchanged — .{15,}/.test(scoreChange) ? null : `skor main'deki ile aynı (${current}) → score_change "unchanged — <en az 15 karakter gerekçe>" olmalı (bilinçli kayıt)`;
  const m = scoreChange.match(/^(\d+)→(\d+) — .{15,}/);
  return m && Number(m[1]) === baseScore && Number(m[2]) === current ? null : `skor ${baseScore}→${current} değişti → score_change "${baseScore}→${current} — <gerekçe>" olmalı`;
}

const sh = (cmd: string) => { try { return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { return null; } };

/** Gerçek main ucu (bu değişikliğin üzerine kurulduğu main commit'i). */
export function expectedMainSha(env: Record<string, string | undefined> = process.env): { sha: string | null; how: string } {
  if (env.GOVERNANCE_MAIN_SHA) return { sha: env.GOVERNANCE_MAIN_SHA, how: "GOVERNANCE_MAIN_SHA" };
  if (env.GITHUB_EVENT_NAME === "pull_request") return { sha: sh("git rev-parse HEAD^1"), how: "PR birleştirme ref'i HEAD^1" };
  if (env.GITHUB_EVENT_NAME === "push" && env.GITHUB_REF === "refs/heads/main") return { sha: sh("git rev-parse HEAD^1"), how: "main push HEAD^1" };
  return { sha: sh("git merge-base HEAD origin/main"), how: "merge-base(HEAD, origin/main)" };
}

function main() {
  const docs = Object.fromEntries(GOVERNANCE_DOCS.map(d => [d, readFileSync(`docs/${d}`, "utf8")]));
  const fms = Object.fromEntries(GOVERNANCE_DOCS.map(d => [d, frontmatter(docs[d])]));
  const errors: string[] = [];

  // 1) alanlar var ve birebir aynı
  for (const d of GOVERNANCE_DOCS) for (const f of GOVERNANCE_FIELDS) if (!fms[d][f]) errors.push(`${d}: '${f}' alanı yok`);
  for (const f of GOVERNANCE_FIELDS) {
    const vals = new Map<string, string[]>();
    for (const d of GOVERNANCE_DOCS) if (fms[d][f]) vals.set(fms[d][f], [...(vals.get(fms[d][f]) ?? []), d]);
    if (vals.size > 1) errors.push(`'${f}' belgeler arasında farklı: ${[...vals].map(([v, ds]) => `${ds.join(",")} = "${v}"`).join(" | ")}`);
  }
  const g = fms["CFO-SCORECARD.md"];

  // 2) gerçek main
  const { sha, how } = expectedMainSha();
  if (!/^[0-9a-f]{7,40}$/.test(g.current_main_commit ?? "")) errors.push(`current_main_commit hex değil: "${g.current_main_commit}"`);
  else if (!sha) errors.push(`gerçek main bulunamadı (${how}); CI checkout fetch-depth ve origin/main gerekli`);
  else if (!sha.startsWith(g.current_main_commit)) errors.push(`current_main_commit ${g.current_main_commit} ≠ gerçek main ${sha.slice(0, 7)} (${how}) — main ilerlemiş; belgeleri güncelle`);

  // 3) açık CRITICAL / HIGH
  const reg = redFlagRegister(docs["CFO-RED-FLAGS.md"]);
  const baseIds = new Set([...docs["CFO-RED-FLAGS.md"].matchAll(/^### (RF-\d{8}-\d{3}) — /gm)].map(m => m[1]));
  for (const id of baseIds) if (!reg.has(id)) errors.push(`CFO-RED-FLAGS Durum kaydında ${id} yok`);
  for (const m of docs["CFO-RED-FLAGS.md"].matchAll(/^### (RF-\d{8}-\d{3}) — güncelleme: RESOLVED/gm))
    if (reg.get(m[1])?.status !== "RESOLVED") errors.push(`${m[1]}: metinde RESOLVED güncellemesi var, Durum kaydı ${reg.get(m[1])?.status ?? "yok"}`);
  const oc = openCounts(reg);
  if (String(oc.critical) !== g.open_critical) errors.push(`open_critical ${g.open_critical} ≠ Durum kaydı ${oc.critical}`);
  if (String(oc.high) !== g.open_high) errors.push(`open_high ${g.open_high} ≠ Durum kaydı ${oc.high}`);

  // 4) skor = puan tablosu
  const score = scoreOf(g.current_score);
  const sc = scorecardTotals(docs["CFO-SCORECARD.md"]);
  if (score == null) errors.push(`current_score "NN/100" değil: "${g.current_score}"`);
  if (sc.total == null || sc.dims.length !== 10) errors.push(`SCORECARD puan tablosu okunamadı (boyut ${sc.dims.length}, TOPLAM ${sc.total})`);
  else {
    const sum = sc.dims.reduce((a, d) => a + d.points, 0);
    if (sum !== sc.total) errors.push(`SCORECARD boyut puanları toplamı ${sum} ≠ TOPLAM ${sc.total}`);
    if (sc.dims.some(d => d.points > d.weight)) errors.push("SCORECARD: ağırlığını aşan boyut puanı");
    if (score != null && score !== sc.total) errors.push(`current_score ${score} ≠ SCORECARD TOPLAM ${sc.total}`);
  }
  if (!sc.lastHistory || !sc.lastHistory.includes(g.current_main_commit ?? "∅") || !new RegExp(`\\|\\s*${score}\\s*\\|`).test(sc.lastHistory))
    errors.push(`SCORECARD skor geçmişinin son satırı current_main_commit (${g.current_main_commit}) ve skoru (${score}) taşımalı: ${sc.lastHistory}`);

  // 5) skor değişimi bilinçli
  const baseScore = sha ? scoreOf(frontmatter(sh(`git show ${sha}:docs/CFO-SCORECARD.md`) ?? "").current_score) : null;
  if (score != null) { const e = checkScoreChange(g.score_change ?? "", baseScore, score); if (e) errors.push(e); }

  // 6) faz ve sıradaki iş
  const ph = g.current_phase?.match(/^Faz (\d+) — /);
  if (!ph) errors.push(`current_phase "Faz N — …" değil: "${g.current_phase}"`);
  else if (!new RegExp(`^\\|\\s*Faz ${ph[1]}\\s*\\|`, "m").test(docs["CFO-MASTER-PLAN.md"])) errors.push(`Faz ${ph[1]} CFO-MASTER-PLAN faz tablosunda yok`);
  const openItems = new Set([...docs["CFO-BACKLOG.md"].matchAll(/^### (CFO-\d{3}) — (.*)$/gm)].filter(m => !m[2].includes("✅ TAMAMLANDI")).map(m => m[1]));
  const named = [...(g.next_action ?? "").matchAll(/CFO-\d{3}/g)].map(m => m[0]);
  if (!named.some(id => openItems.has(id))) errors.push(`next_action açık bir backlog maddesi (CFO-###) içermeli: "${g.next_action}"`);

  assert.deepEqual(errors, [], `CFO-GOVERNANCE-DRIFT:\n- ${errors.join("\n- ")}`);
  console.log(`CFO governance drift: ${GOVERNANCE_DOCS.length} belge × ${GOVERNANCE_FIELDS.length} alan tutarlı; main ${g.current_main_commit} (${how}); skor ${score}/100 = scorecard; açık CRITICAL ${oc.critical} / HIGH ${oc.high}; score_change "${g.score_change.split(" — ")[0]}" passed`);
}

// Saf yardımcıların kendi testleri (belge içeriğinden bağımsız)
function selfTest() {
  assert.deepEqual(frontmatter(`---\na: 1\nb: "x y"\n---\n# t`), { a: "1", b: "x y" });
  assert.equal(scoreOf("52/100 (hard gate 5/12)"), 52); assert.equal(scoreOf("x"), null);
  assert.equal(checkScoreChange("unchanged — yalnız belge senkronu, puanlanan kanıt yok", 52, 52), null);
  assert.ok(checkScoreChange("52→58 — gerekçe yeterince uzun bir metin", 52, 52), "skor aynıyken değişim yazılamaz");
  assert.ok(checkScoreChange("unchanged — gerekçe yeterince uzun bir metin", 52, 58), "skor değiştiyse unchanged yazılamaz");
  assert.equal(checkScoreChange("52→58 — üç boyut kanıtla yükseldi (ayrıntı tabloda)", 52, 58), null);
  assert.ok(checkScoreChange("unchanged — kısa", 52, 52), "gerekçe zorunlu");
  const reg = redFlagRegister("## Durum kaydı\n| RF | s | d |\n|---|---|---|\n| RF-20261008-001 | CRITICAL | IN_PROGRESS | x |\n| RF-20261008-002 | HIGH | RESOLVED | y |\n| RF-20261008-003 | HIGH | OPEN | z |\n## sonra");
  assert.deepEqual(openCounts(reg), { critical: 1, high: 1 });
  assert.equal(expectedMainSha({ GOVERNANCE_MAIN_SHA: "abc1234" }).sha, "abc1234");
}

selfTest();
main();
