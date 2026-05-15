export const CUSTOMER_TYPE_OPTIONS = [
  "TOPTAN",
  "PERAKENDE",
  "SITE_YONETICISI",
  "GUVENLIK_SIRKETI",
  "MAGAZA",
  "ONLINE_SATICI",
  "CUSTOM",
] as const;

export type CustomerType = (typeof CUSTOMER_TYPE_OPTIONS)[number];

export const CUSTOMER_TYPE_LABELS: Record<CustomerType, string> = {
  TOPTAN:           "Toptan",
  PERAKENDE:        "Perakende",
  SITE_YONETICISI:  "Site Yöneticisi",
  GUVENLIK_SIRKETI: "Güvenlik Şirketi",
  MAGAZA:           "Mağaza",
  ONLINE_SATICI:    "Online Satıcı",
  CUSTOM:           "Özel",
};

export const CUSTOMER_STATUS_OPTIONS = [
  "NEW",
  "CONTACTED",
  "QUOTED",
  "NEGOTIATING",
  "WON",
  "LOST",
] as const;

export type CustomerStatus = (typeof CUSTOMER_STATUS_OPTIONS)[number];

export const CUSTOMER_SOURCE_OPTIONS = [
  "WhatsApp",
  "Telefon",
  "Fuar",
  "Web sitesi",
  "Referans",
  "Instagram",
  "Facebook",
  "Google Ads",
  "Organik Arama",
  "Sahibinden",
  "Trendyol",
  "Hepsiburada",
  "Alibaba",
  "Manuel",
  "Diğer",
] as const;

export type CustomerSource = (typeof CUSTOMER_SOURCE_OPTIONS)[number];

export const INTEREST_STAGE_OPTIONS = [
  "INTERESTED",
  "PRICE_SENT",
  "NEGOTIATING",
  "WAITING",
  "ORDERED",
  "CANCELLED",
] as const;

export type InterestStage = (typeof INTEREST_STAGE_OPTIONS)[number];

export const NOTE_TYPE_OPTIONS = [
  "NOTE",
  "CALL",
  "MEETING",
  "EMAIL",
  "WHATSAPP",
  "QUOTE",
] as const;

export type NoteType = (typeof NOTE_TYPE_OPTIONS)[number];

export const TASK_STATUS_OPTIONS = ["OPEN", "DONE", "CANCELLED"] as const;
export type TaskStatus = (typeof TASK_STATUS_OPTIONS)[number];

export const TASK_PRIORITY_OPTIONS = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export type TaskPriority = (typeof TASK_PRIORITY_OPTIONS)[number];

export type CustomerFormValues = {
  name: string;
  company: string;
  phone: string;
  whatsapp: string;
  email: string;
  taxNumber: string;
  address: string;
  city: string;
  district: string;
  notes: string;
  status: CustomerStatus;
  source: string;
  ownedById: string;
  customerType: string;
  monthlySalesPotential: string;
  platformNotes: string;
};

export type CustomerInterestFormValues = {
  productId: string;
  quantity: number;
  quotedPrice: string;
  currency: string;
  stage: InterestStage;
  notes: string;
};

export type CustomerTimelineNoteFormValues = {
  note: string;
  type: NoteType;
};

export type CustomerTaskFormValues = {
  title: string;
  description: string;
  dueDate: string;
  priority: TaskPriority;
};
