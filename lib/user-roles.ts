export type UserRole =
  | "ADMIN"
  | "SALES"
  | "OPERATIONS"
  | "WAREHOUSE"
  | "MARKETPLACE_OPERATOR"
  | "CUSTOM";

export const ALL_USER_ROLES: UserRole[] = [
  "ADMIN",
  "SALES",
  "OPERATIONS",
  "WAREHOUSE",
  "MARKETPLACE_OPERATOR",
  "CUSTOM",
];

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: "Admin",
  SALES: "Satış",
  OPERATIONS: "Operasyon",
  WAREHOUSE: "Depo",
  MARKETPLACE_OPERATOR: "Mağaza Operatörü",
  CUSTOM: "Özel",
};
