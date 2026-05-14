import type {
  CustomerStatus,
  InterestStage,
  NoteType,
  TaskPriority,
  TaskStatus,
} from "@/types/customers";

export function formatCustomerStatus(status: CustomerStatus) {
  return {
    NEW: "New",
    CONTACTED: "Contacted",
    QUOTED: "Quoted",
    NEGOTIATING: "Negotiating",
    WON: "Won",
    LOST: "Lost",
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
    INTERESTED: "Interested",
    PRICE_SENT: "Price sent",
    NEGOTIATING: "Negotiating",
    WAITING: "Waiting",
    ORDERED: "Ordered",
    CANCELLED: "Cancelled",
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
    NOTE: "Note",
    CALL: "Call",
    MEETING: "Meeting",
    EMAIL: "Email",
    WHATSAPP: "WhatsApp",
    QUOTE: "Quote",
  }[type];
}

export function formatTaskStatus(status: TaskStatus) {
  return {
    OPEN: "Open",
    DONE: "Done",
    CANCELLED: "Cancelled",
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
    LOW: "Low",
    MEDIUM: "Medium",
    HIGH: "High",
    URGENT: "Urgent",
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
