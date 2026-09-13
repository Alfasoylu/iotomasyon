"use client";

/**
 * Defter denetimi rozeti — `cfo_defter_denetim()` sonucunu sayfanın başında gösterir.
 *
 * Denetim şimdiye kadar yalnız CFO'nun sabah koşusunda çalışıyordu; Alperen gün içinde
 * sayfaya baktığında defterde eksik/mükerrer kayıt olduğunu göremiyordu. Bu ekranın
 * tüm hesabı deftere dayandığı için, defter bozuksa aşağıdaki her rakam bozuktur —
 * uyarı bu yüzden sayfanın en üstünde ve rakamlardan ÖNCE duruyor.
 *
 * Temizken tek satır kalır; bulgu varsa açılıp ne yapılacağını söyler.
 */

import { useState } from "react";
import { ShieldCheck, ShieldAlert, ChevronDown, ChevronUp } from "lucide-react";

export type DenetimSatiri = {
  sira: number;
  kod: string;
  seviye: string;
  bulgu: string;
  detay: string | null;
  ne_yapmali: string | null;
};

const TON = {
  KIRMIZI: {
    kutu: "border-[var(--danger-border)] bg-[var(--danger-dim)]",
    yazi: "text-[var(--danger)]",
  },
  SARI: {
    kutu: "border-[var(--warn-border)] bg-[var(--warn-dim)]",
    yazi: "text-[var(--warn)]",
  },
  YESIL: {
    kutu: "border-[var(--border-default)] bg-[var(--surface-2)]",
    yazi: "text-[var(--text-muted)]",
  },
} as const;

function ton(seviye: string) {
  return TON[seviye as keyof typeof TON] ?? TON.YESIL;
}

export function AuditPanel({ satirlar }: { satirlar: DenetimSatiri[] }) {
  const [acik, setAcik] = useState(false);

  // YEŞİL olmayan her şey sorundur. Bilinmeyen bir seviye eklenirse gizlenmesin diye
  // beyaz liste değil kara liste mantığı: sadece YESIL temiz sayılır.
  const kirmizi = satirlar.filter((s) => s.seviye === "KIRMIZI");
  const sari = satirlar.filter((s) => s.seviye === "SARI");
  const bilinmeyen = satirlar.filter(
    (s) => s.seviye !== "KIRMIZI" && s.seviye !== "SARI" && s.seviye !== "YESIL",
  );
  const sorunlu = satirlar.filter((s) => s.seviye !== "YESIL");
  const temiz = sorunlu.length === 0;

  const seviye = kirmizi.length > 0 || bilinmeyen.length > 0 ? "KIRMIZI" : sari.length > 0 ? "SARI" : "YESIL";
  const t = ton(seviye);

  const ozet = temiz
    ? `Defter denetimi temiz — ${satirlar.length} kontrolün hepsi geçti`
    : [
        kirmizi.length > 0 ? `${kirmizi.length} kırmızı` : null,
        sari.length > 0 ? `${sari.length} sarı` : null,
        bilinmeyen.length > 0 ? `${bilinmeyen.length} bilinmeyen seviye` : null,
      ]
        .filter(Boolean)
        .join(" · ");

  return (
    <div className={`mb-4 rounded-lg border px-4 py-3 ${t.kutu}`}>
      <button
        className="flex w-full items-center gap-2 text-left"
        onClick={() => setAcik((v) => !v)}
        aria-expanded={acik}
      >
        {temiz ? (
          <ShieldCheck size={15} className="shrink-0 text-[var(--ok)]" />
        ) : (
          <ShieldAlert size={15} className={`shrink-0 ${t.yazi}`} />
        )}
        <span className={`text-[13px] font-medium ${temiz ? "text-[var(--text-secondary)]" : t.yazi}`}>
          {temiz ? ozet : `Defter denetimi: ${ozet}`}
        </span>
        {!temiz && (
          <span className="text-[11px] text-[var(--text-muted)]">
            — aşağıdaki rakamlar bu bulgular kadar eksik
          </span>
        )}
        <span className="ml-auto shrink-0 text-[var(--text-muted)]">
          {acik ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </span>
      </button>

      {acik && (
        <ul className="mt-3 space-y-2 border-t border-[var(--border-subtle)] pt-3">
          {(acik && !temiz ? sorunlu : satirlar).map((s) => {
            const st = ton(s.seviye);
            return (
              <li key={s.kod} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] ${st.kutu} ${st.yazi}`}
                >
                  {s.kod}
                </span>
                <span className="text-[12px] text-[var(--text-primary)]">{s.bulgu}</span>
                {s.detay && s.detay !== "yok" && (
                  <span className="text-[11px] text-[var(--text-muted)]">· {s.detay}</span>
                )}
                {s.seviye !== "YESIL" && s.ne_yapmali && (
                  <span className="basis-full text-[11px] leading-snug text-[var(--text-secondary)]">
                    → {s.ne_yapmali}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
