import { Badge } from "@/components/ui/badge";
import type { Traffic } from "@/lib/cfo/engine";

const TRAFFIC_LABEL: Record<Traffic, string> = {
  YESIL: "Güvenli",
  SARI: "Dikkat",
  KIRMIZI: "Müdahale gerekli",
  NOTR: "—",
};
const TRAFFIC_VARIANT: Record<Traffic, "ok" | "warn" | "danger" | "neutral"> = {
  YESIL: "ok", SARI: "warn", KIRMIZI: "danger", NOTR: "neutral",
};

/** Trafik ışığı: YEŞİL = güvenli, SARI = boş KMH ile kapanır, KIRMIZI = kapasite yetmiyor. */
export function TrafficBadge({ value, label }: { value: Traffic; label?: string }) {
  return <Badge variant={TRAFFIC_VARIANT[value]}>{label ?? TRAFFIC_LABEL[value]}</Badge>;
}

const TAG_LABEL: Record<string, string> = {
  KESIN: "Kesin",
  TAHMINI: "Tahmini",
  ESKI: "Eski",
  GUNCELLEME_GEREKLI: "Güncelleme gerekli",
  TEYIT_EDILMELI: "Teyit edilmeli",
};
const TAG_VARIANT: Record<string, "ok" | "warn" | "danger" | "neutral"> = {
  KESIN: "ok", TAHMINI: "warn", ESKI: "neutral",
  GUNCELLEME_GEREKLI: "danger", TEYIT_EDILMELI: "danger",
};

/** Veri kalitesi etiketi — her finansal satırda zorunlu. */
export function DataTagBadge({ tag }: { tag: string }) {
  return <Badge variant={TAG_VARIANT[tag] ?? "neutral"}>{TAG_LABEL[tag] ?? tag}</Badge>;
}

const PAY_LABEL: Record<string, string> = {
  ODENDI: "Ödendi",
  ODENMEDI: "Ödenmedi",
  TEYIT_EDILMELI: "Teyit edilmeli",
  KISMI_ODENDI: "Kısmi ödendi",
};
const PAY_VARIANT: Record<string, "ok" | "warn" | "danger" | "neutral"> = {
  ODENDI: "ok", ODENMEDI: "danger", TEYIT_EDILMELI: "warn", KISMI_ODENDI: "warn",
};

export function PaymentStateBadge({ state }: { state: string }) {
  return <Badge variant={PAY_VARIANT[state] ?? "neutral"}>{PAY_LABEL[state] ?? state}</Badge>;
}
