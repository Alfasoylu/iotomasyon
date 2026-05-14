import type {
  CustomerStatus,
  InterestStage,
  NoteType,
  TaskPriority,
  TaskStatus,
} from "@/types/customers";

export function formatCustomerStatus(status: CustomerStatus) {
  return {
    NEW: "Yeni",
    CONTACTED: "İletişim Kuruldu",
    QUOTED: "Teklif Verildi",
    NEGOTIATING: "Müzakere",
    WON: "Kazanıldı",
    LOST: "Kaybedildi",
  }[status];
}

export function getCustomerStatusTone(status: CustomerStatus) {
  if (status === "WON") {
    return "success" as const;
  }

  if (status === "LOST") {
    return "danger" as const;
  }

  if (status === "QUOTED" || status === "NEGOTIATING") {
    return "warning" as const;
  }

  return "default" as const;
}

export function formatInterestStage(stage: InterestStage) {
  return {
    INTERESTED: "İlgileniyor",
    PRICE_SENT: "Fiyat Gönderildi",
    NEGOTIATING: "Müzakere",
    WAITING: "Bekliyor",
    ORDERED: "Sipariş Verildi",
    CANCELLED: "İptal",
  }[stage];
}

export function getInterestStageTone(stage: InterestStage) {
  if (stage === "ORDERED") {
    return "success" as const;
  }

  if (stage === "CANCELLED") {
    return "danger" as const;
  }

  if (stage === "PRICE_SENT" || stage === "NEGOTIATING" || stage === "WAITING") {
    return "warning" as const;
  }

  return "default" as const;
}

export function formatNoteType(type: NoteType) {
  return {
    NOTE: "Not",
    CALL: "Çağrı",
    MEETING: "Toplantı",
    EMAIL: "E-posta",
    WHATSAPP: "WhatsApp",
    QUOTE: "Teklif",
  }[type];
}

export function formatTaskStatus(status: TaskStatus) {
  return {
    OPEN: "Açık",
    DONE: "Tamamlandı",
    CANCELLED: "İptal",
  }[status];
}

export function getTaskStatusTone(status: TaskStatus) {
  if (status === "DONE") {
    return "success" as const;
  }

  if (status === "CANCELLED") {
    return "danger" as const;
  }

  return "warning" as const;
}

export function formatTaskPriority(priority: TaskPriority) {
  return {
    LOW: "Düşük",
    MEDIUM: "Orta",
    HIGH: "Yüksek",
    URGENT: "Acil",
  }[priority];
}

export function getTaskPriorityTone(priority: TaskPriority) {
  if (priority === "URGENT" || priority === "HIGH") {
    return "danger" as const;
  }

  if (priority === "MEDIUM") {
    return "warning" as const;
  }

  return "default" as const;
}
