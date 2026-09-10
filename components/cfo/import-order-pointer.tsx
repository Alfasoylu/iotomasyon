import Link from "next/link";
import { Ship, ArrowRight } from "lucide-react";

/**
 * "Sıradaki sipariş" listesi buradan kaldırıldı — tek yeri /cfo/kazananlar.
 *
 * 10.09.2026: aynı soru ("bir sonraki ithalatta ne alalım?") panelde sekiz ayrı
 * sayfada, sekiz ayrı hesapla cevaplanıyordu. Hepsi Trendyol satışından kendi
 * başına türetiyordu ve hiçbiri CFO'nun fiilen karar verdiği parti defterini
 * (cfo_order_line) okumuyordu; sayfa başına farklı cevap çıkıyordu.
 *
 * Liste silinince yerine boşluk bırakmıyoruz: kullanıcı o listeyi burada aradığı
 * için, nereye taşındığını ve NİYE taşındığını aynı yerde söylüyoruz.
 */
export function ImportOrderPointer({
  neydi,
  className = "",
}: {
  /** Bu sayfada duran listenin adı — kullanıcı aradığı şeyi tanısın diye. */
  neydi: string;
  className?: string;
}) {
  return (
    <Link
      href="/cfo/kazananlar#ithalat"
      className={`flex items-start gap-2.5 rounded-lg border border-[var(--border-default)] bg-[var(--surface-2)] px-4 py-3 transition hover:border-[var(--accent-border)] ${className}`}
    >
      <Ship size={15} className="mt-0.5 shrink-0 text-[var(--text-secondary)]" />
      <span className="min-w-0">
        <span className="block text-[12px] font-medium text-[var(--text-primary)]">
          {neydi} → Ayın Kazananları / İthalat sipariş önerisi
          <ArrowRight size={12} className="ml-1 inline" />
        </span>
        <span className="mt-0.5 block text-[11px] leading-snug text-[var(--text-muted)]">
          Sıradaki sipariş listesi tek sayfada toplandı. Orada hava ve deniz partileri ayrı
          durur, tavsiye edilen sipariş tarihi, minimum ithalat tutarı ve nakit kapısı birlikte
          hesaplanır. Bu sayfadaki kopya liste kaldırıldı; iki farklı cevap üretiyordu.
        </span>
      </span>
    </Link>
  );
}
