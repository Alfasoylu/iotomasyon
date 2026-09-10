"use client";

/**
 * Satır sonundaki açılır bilgi alanı.
 *
 * İki iş yapar:
 *   1) O satır hakkında panelin CEVABINI BİLMEDİĞİ soruları sorar ve cevabı kaydeder.
 *   2) "Bu ürünü getirmeyelim" kararını gerekçesiyle birlikte kaydeder.
 *
 * Tasarım kararı: soru metniyle birlikte NEDEN sorulduğu da yazılıyor. Gerekçesiz
 * soru cevaplanmıyor — "birim maliyet nedir" tek başına angarya, "bu kalem maliyeti
 * bilinmediği için parti toplamına girmiyor, gerçek tutar ekrandakinden yüksek"
 * cevap vermeye değer bir sebep.
 *
 * Rozet satırın sonunda duruyor ve durumu dışarıdan okunuyor: kaç açık soru var,
 * karar verilmiş mi. Böylece tabloyu taramak için her satırı açmak gerekmiyor.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown, ChevronUp, CircleHelp, Check, Ban, RotateCcw, Loader2,
} from "lucide-react";
import {
  answerRowQuestionAction,
  setProductDecisionAction,
  clearProductDecisionAction,
} from "@/lib/actions/cfo-row-qa";

export type PanelSorusu = {
  code: string;
  soru: string;
  neden: string;
  area: string;
  cevap: string | null;
  cevapTarihi: Date | string | null;
  cevaplayan: string | null;
  islendiTarihi: Date | string | null;
  islemNotu: string | null;
};

export type PanelKarari = {
  karar: string;
  sebep: string;
  gecerli_bitis: Date | string | null;
  karar_veren: string | null;
} | null;

const KARAR_ETIKET: Record<string, string> = {
  ALMA: "Alma",
  BEKLE: "Beklet",
  AL: "Al",
};

function tarih(d: Date | string | null) {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Satır sonundaki tetikleyici rozet — açık soru sayısını ve kararı gösterir. */
export function RowQaBadge({
  acikSoru,
  karar,
  acik,
  onToggle,
}: {
  acikSoru: number;
  karar: PanelKarari;
  acik: boolean;
  onToggle: () => void;
}) {
  const ton =
    karar?.karar === "ALMA"
      ? "border-[var(--danger-border)] bg-[var(--danger-dim)] text-[var(--danger)]"
      : acikSoru > 0
        ? "border-[var(--warn-border)] bg-[var(--warn-dim)] text-[var(--warn)]"
        : "border-[var(--border-default)] text-[var(--text-muted)]";

  return (
    <button
      onClick={onToggle}
      aria-expanded={acik}
      className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition hover:border-[var(--accent-border)] hover:text-[var(--accent)] ${ton}`}
      title={
        karar?.karar === "ALMA"
          ? `Alma kararı: ${karar.sebep}`
          : acikSoru > 0
            ? `${acikSoru} cevaplanmamış soru`
            : "Bilgi ekle"
      }
    >
      {karar?.karar === "ALMA" ? (
        <>
          <Ban size={11} /> Alma
        </>
      ) : acikSoru > 0 ? (
        <>
          <CircleHelp size={11} /> {acikSoru} soru
        </>
      ) : (
        <CircleHelp size={11} />
      )}
      {acik ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
    </button>
  );
}

/** Açılan alanın gövdesi — ayrı bir <tr> içinde tam genişlikte basılır. */
export function RowQaPanel({
  scope,
  entityKey,
  sku,
  urunAdi,
  sorular,
  karar,
  kararGoster = true,
}: {
  scope: string;
  entityKey: string;
  sku: string;
  urunAdi: string;
  sorular: PanelSorusu[];
  karar: PanelKarari;
  /** Kazananlar tablosunda "bu ürünü alma" kararı anlamlı değil — gizlenebilir. */
  kararGoster?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [mesaj, setMesaj] = useState<string | null>(null);
  const [taslak, setTaslak] = useState<Record<string, string>>({});
  const [sebep, setSebep] = useState("");
  const [bitis, setBitis] = useState("");

  function cevapla(s: PanelSorusu) {
    const cevap = (taslak[s.code] ?? "").trim();
    if (cevap.length < 2) {
      setMesaj("Cevap boş olamaz.");
      return;
    }
    start(async () => {
      const r = await answerRowQuestionAction({
        scope, entityKey, code: s.code,
        question: s.soru, why: s.neden, area: s.area,
        answer: cevap,
      });
      setMesaj(r.message ?? null);
      if (r.ok) {
        setTaslak((t) => ({ ...t, [s.code]: "" }));
        router.refresh();
      }
    });
  }

  function kararVer(k: "ALMA" | "BEKLE") {
    start(async () => {
      const r = await setProductDecisionAction({
        sku, karar: k, sebep, gecerliBitis: bitis || null,
      });
      setMesaj(r.message ?? null);
      if (r.ok) {
        setSebep("");
        setBitis("");
        router.refresh();
      }
    });
  }

  function kararKaldir() {
    start(async () => {
      const r = await clearProductDecisionAction(sku);
      setMesaj(r.message ?? null);
      if (r.ok) router.refresh();
    });
  }

  const input =
    "w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-1)] px-2.5 py-1.5 " +
    "text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] " +
    "focus:border-[var(--accent-border)] focus:outline-none";
  const btn =
    "inline-flex shrink-0 items-center gap-1 rounded-md border border-[var(--border-default)] " +
    "px-2.5 py-1.5 text-[11px] text-[var(--text-secondary)] transition " +
    "hover:border-[var(--accent-border)] hover:text-[var(--accent)] disabled:opacity-50";

  return (
    <div className="space-y-4 border-l-2 border-[var(--accent-border)] bg-[var(--surface-1)] px-4 py-3">
      <p className="text-[11px] text-[var(--text-muted)]">
        <span className="font-medium text-[var(--text-secondary)]">{urunAdi}</span> · buraya
        yazdıklarınız kalıcıdır ve hem panelin hem CFO&apos;nun hesaplarında kullanılır.
      </p>

      {/* ── Sorular ─────────────────────────────────────────────── */}
      {sorular.length === 0 ? (
        <p className="text-[12px] text-[var(--text-muted)]">
          Bu satır hakkında açık soru yok — eksik bilgi tespit edilmedi.
        </p>
      ) : (
        <div className="space-y-3">
          {sorular.map((s) => (
            <div key={s.code} className="rounded-md border border-[var(--border-subtle)] p-3">
              <p className="text-[12px] font-medium leading-snug text-[var(--text-primary)]">
                {s.soru}
              </p>
              {s.neden && (
                <p className="mt-1 text-[11px] leading-snug text-[var(--text-muted)]">
                  Neden soruluyor: {s.neden}
                </p>
              )}

              {s.cevap && (
                <div className="mt-2 rounded border border-[var(--ok-border)] bg-[var(--ok-dim)] px-2.5 py-1.5">
                  <p className="text-[12px] text-[var(--text-primary)]">{s.cevap}</p>
                  <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
                    {s.cevaplayan} · {tarih(s.cevapTarihi)}
                    {s.islendiTarihi
                      ? ` · CFO işledi: ${s.islemNotu ?? tarih(s.islendiTarihi)}`
                      : " · CFO'nun işlemesi bekleniyor"}
                  </p>
                </div>
              )}

              <div className="mt-2 flex flex-wrap items-end gap-2">
                <textarea
                  className={`${input} min-h-[38px] flex-1`}
                  rows={2}
                  placeholder={s.cevap ? "Cevabı güncelle…" : "Cevabınız…"}
                  value={taslak[s.code] ?? ""}
                  onChange={(e) => setTaslak((t) => ({ ...t, [s.code]: e.target.value }))}
                />
                <button className={btn} disabled={pending} onClick={() => cevapla(s)}>
                  {pending ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                  {s.cevap ? "Güncelle" : "Kaydet"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Ürün kararı ─────────────────────────────────────────── */}
      {kararGoster && (
        <div className="rounded-md border border-[var(--border-subtle)] p-3">
          <p className="text-[12px] font-medium text-[var(--text-primary)]">Bu ürün için karar</p>
          <p className="mt-1 text-[11px] leading-snug text-[var(--text-muted)]">
            &quot;Alma&quot; dersen bu ürün öneriden çıkar; tutara ve minimum ithalat eşiğine
            girmez. Karar parti değişse de yaşar.
          </p>

          {karar ? (
            <div className="mt-2 rounded border border-[var(--danger-border)] bg-[var(--danger-dim)] px-2.5 py-1.5">
              <p className="text-[12px] font-medium text-[var(--danger)]">
                {KARAR_ETIKET[karar.karar] ?? karar.karar}
                {karar.gecerli_bitis ? ` · ${tarih(karar.gecerli_bitis)} tarihine kadar` : " · süresiz"}
              </p>
              <p className="mt-0.5 text-[12px] text-[var(--text-primary)]">{karar.sebep}</p>
              <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">{karar.karar_veren}</p>
              <button className={`${btn} mt-2`} disabled={pending} onClick={kararKaldir}>
                <RotateCcw size={11} /> Kararı kaldır
              </button>
            </div>
          ) : (
            <div className="mt-2 space-y-2">
              <textarea
                className={`${input} min-h-[38px]`}
                rows={2}
                placeholder="Neden almıyoruz? (zorunlu — altı ay sonra bu satır cevabı olacak)"
                value={sebep}
                onChange={(e) => setSebep(e.target.value)}
              />
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-[11px] text-[var(--text-muted)]">
                  Bitiş (boş = süresiz)
                  <input
                    type="date"
                    className={`${input} mt-0.5`}
                    value={bitis}
                    onChange={(e) => setBitis(e.target.value)}
                  />
                </label>
                <button
                  className={`${btn} border-[var(--danger-border)] text-[var(--danger)]`}
                  disabled={pending || sebep.trim().length < 3}
                  onClick={() => kararVer("ALMA")}
                >
                  <Ban size={11} /> Bu ürünü alma
                </button>
                <button
                  className={btn}
                  disabled={pending || sebep.trim().length < 3}
                  onClick={() => kararVer("BEKLE")}
                >
                  Beklet
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {mesaj && <p className="text-[11px] text-[var(--text-secondary)]">{mesaj}</p>}
    </div>
  );
}

/**
 * Tabloda tek bir satır + altında açılan panel.
 *
 * Hücreler `children` olarak sunucu tarafından geliyor; açılma durumu burada
 * tutuluyor. Böylece tablonun tamamını client component yapmak gerekmiyor —
 * yalnızca satırın kabuğu client.
 */
export function QaRow({
  children,
  colSpan,
  scope,
  entityKey,
  sku,
  urunAdi,
  sorular,
  karar,
  kararGoster = true,
  vurgu = false,
}: {
  children: React.ReactNode;
  /** Veri hücrelerinin sayısı — panel satırı bunun bir fazlasını kaplar. */
  colSpan: number;
  scope: string;
  entityKey: string;
  sku: string;
  urunAdi: string;
  sorular: PanelSorusu[];
  karar: PanelKarari;
  kararGoster?: boolean;
  /** Hariç tutulmuş satır soluk basılır. */
  vurgu?: boolean;
}) {
  const [acik, setAcik] = useState(false);
  const acikSoru = sorular.filter((s) => !s.cevap).length;

  return (
    <>
      <tr className={vurgu ? "opacity-50" : ""}>
        {children}
        <td className="px-3 py-2 text-right align-top">
          <RowQaBadge
            acikSoru={acikSoru}
            karar={karar}
            acik={acik}
            onToggle={() => setAcik((v) => !v)}
          />
        </td>
      </tr>
      {acik && (
        <tr>
          <td colSpan={colSpan + 1} className="p-0">
            <RowQaPanel
              scope={scope}
              entityKey={entityKey}
              sku={sku}
              urunAdi={urunAdi}
              sorular={sorular}
              karar={karar}
              kararGoster={kararGoster}
            />
          </td>
        </tr>
      )}
    </>
  );
}
