/**
 * IOTOMASYON Permission System
 *
 * This file contains:
 * 1. Typed permission key constants  (PERMISSIONS)
 * 2. Dangerous permission set        (DANGEROUS_PERMISSIONS)
 * 3. Permission resolution logic     (resolvePermission)
 *
 * Role default assignments live in the DB (prisma/seed.ts → RolePermission table).
 * This file does NOT contain hardcoded role defaults — that is intentional.
 *
 * Resolution order:
 *   1. Dangerous gate  — applies to ALL roles including ADMIN
 *   2. ADMIN bypass    — non-dangerous only
 *   3. Explicit deny   — UserPermission(granted=false)
 *   4. Explicit grant  — UserPermission(granted=true)
 *   5. Role default    — RolePermission lookup
 *   6. Deny by default
 */

// ── Permission key constants ─────────────────────────────────────────────────

export const PERMISSIONS = {
  // User management
  USERS_READ:             "users.read",
  USERS_CREATE:           "users.create",
  USERS_UPDATE:           "users.update",
  USERS_DISABLE:          "users.disable",
  USERS_RESET_PASSWORD:   "users.resetPassword",
  PERMISSIONS_MANAGE:     "permissions.manage",

  // Customers
  CUSTOMERS_READ:         "customers.read",
  CUSTOMERS_CREATE:       "customers.create",
  CUSTOMERS_UPDATE:       "customers.update",
  CUSTOMERS_DELETE:       "customers.delete",

  // Products
  PRODUCTS_READ:          "products.read",
  PRODUCTS_CREATE:        "products.create",
  PRODUCTS_UPDATE:        "products.update",
  PRODUCTS_DELETE:        "products.delete",

  // Categories
  CATEGORIES_READ:        "categories.read",
  CATEGORIES_CREATE:      "categories.create",
  CATEGORIES_UPDATE:      "categories.update",
  CATEGORIES_DELETE:      "categories.delete",

  // Attributes
  ATTRIBUTES_READ:        "attributes.read",
  ATTRIBUTES_CREATE:      "attributes.create",
  ATTRIBUTES_UPDATE:      "attributes.update",
  ATTRIBUTES_DELETE:      "attributes.delete",

  // Quotes
  QUOTES_READ:            "quotes.read",
  QUOTES_CREATE:          "quotes.create",
  QUOTES_UPDATE:          "quotes.update",
  QUOTES_DELETE:          "quotes.delete",
  QUOTES_SEND:            "quotes.send",

  // Tasks
  TASKS_READ:             "tasks.read",
  TASKS_CREATE:           "tasks.create",
  TASKS_UPDATE:           "tasks.update",
  TASKS_DELETE:           "tasks.delete",
  TASKS_ASSIGN:           "tasks.assign",

  // Campaigns
  CAMPAIGNS_READ:         "campaigns.read",
  CAMPAIGNS_CREATE:       "campaigns.create",
  CAMPAIGNS_UPDATE:       "campaigns.update",
  CAMPAIGNS_DELETE:       "campaigns.delete",
  CAMPAIGNS_SEND:         "campaigns.send",

  // Search / Activity
  SEARCH_READ:            "search.read",
  ACTIVITY_READ:          "activity.read",

  // Inventory
  INVENTORY_READ:         "inventory.read",
  INVENTORY_WRITE:        "inventory.write",
  INVENTORY_COUNT:        "inventory.count",
  INVENTORY_SYNC:         "inventory.sync",

  // XML Sync
  XML_READ:               "xml.read",
  XML_CONFIGURE:          "xml.configure",
  XML_SYNC:               "xml.sync",

  // Marketplace Listings
  MARKETPLACE_LISTINGS_READ:    "marketplaceListings.read",
  MARKETPLACE_LISTINGS_WRITE:   "marketplaceListings.write",
  MARKETPLACE_LISTINGS_MONITOR: "marketplaceListings.monitor",

  // Marketplace Read Intelligence
  MARKETPLACE_ANALYTICS_READ:   "marketplaceAnalytics.read",
  MARKETPLACE_ORDERS_READ:      "marketplaceOrders.read",
  MARKETPLACE_RETURNS_READ:     "marketplaceReturns.read",

  // Marketplace Operations (Phase 16)
  MARKETPLACE_QUESTIONS_READ:   "marketplaceQuestions.read",
  MARKETPLACE_QUESTIONS_ANSWER: "marketplaceQuestions.answer",
  MARKETPLACE_RETURNS_ACTION:   "marketplaceReturns.action",
  MARKETPLACE_MAPPINGS_READ:    "marketplaceMappings.read",
  MARKETPLACE_MAPPINGS_WRITE:   "marketplaceMappings.write",
  EXCHANGE_RATES_MANAGE:        "exchangeRates.manage",

  // Profitability
  PROFITABILITY_READ:           "profitability.read",
  PROFITABILITY_CONFIGURE:      "profitability.configure",

  // Procurement
  PROCUREMENT_READ:             "procurement.read",
  PROCUREMENT_RECOMMEND:        "procurement.recommend",
  PROCUREMENT_APPROVE:          "procurement.approve",

  // Suppliers
  SUPPLIERS_READ:               "suppliers.read",
  SUPPLIERS_WRITE:              "suppliers.write",

  // Executive
  EXECUTIVE_READ:               "executive.read",

  // Dangerous — require explicit UserPermission grant even for ADMIN
  MIGRATIONS_APPROVE:           "migrations.approve",
  DESTRUCTIVE_ACTIONS_APPROVE:  "destructiveActions.approve",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

// ── Dangerous permission set ─────────────────────────────────────────────────
// These bypass the ADMIN short-circuit.
// Only accessible via an explicit UserPermission(granted=true) row.
// Must never appear in any RolePermission row.

export const DANGEROUS_PERMISSIONS = new Set<string>([
  PERMISSIONS.MIGRATIONS_APPROVE,
  PERMISSIONS.DESTRUCTIVE_ACTIONS_APPROVE,
]);

// ── Resolved user type ───────────────────────────────────────────────────────
// Shape returned by getCurrentSession() after Phase 5C.

export type UserOverride = {
  granted: boolean;
  permission: { key: string };
};

export type ResolvedUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  userPermissions: UserOverride[];
};

// ── Role default cache ───────────────────────────────────────────────────────
// Loaded once per request via getRoleDefaults(); cached in module scope per role key
// for the lifetime of the request (React cache() handles deduplication upstream).

let _roleDefaultsCache: Map<string, Set<string>> | null = null;

export async function getRoleDefaults(roleKey: string): Promise<Set<string>> {
  if (!_roleDefaultsCache) {
    _roleDefaultsCache = new Map();
  }

  if (_roleDefaultsCache.has(roleKey)) {
    return _roleDefaultsCache.get(roleKey)!;
  }

  const { prisma } = await import("@/lib/prisma");

  let defaults = new Set<string>();
  try {
    const role = await prisma.role.findUnique({
      where: { key: roleKey },
      include: {
        permissions: {
          include: {
            permission: { select: { key: true } },
          },
        },
      },
    });
    defaults = new Set<string>(role?.permissions.map((rp) => rp.permission.key) ?? []);
  } catch {
    // Role/Permission tables not yet migrated — treat role as having no defaults.
    // ADMIN bypass in resolvePermission() ensures ADMIN users retain full access.
  }

  _roleDefaultsCache.set(roleKey, defaults);
  return defaults;
}

// Reset cache — called at end of each server request cycle if needed.
// In practice, React's cache() on getCurrentSession prevents stale data.
export function clearRoleDefaultsCache() {
  _roleDefaultsCache = null;
}

// ── Core permission resolver ─────────────────────────────────────────────────

export async function resolvePermission(
  user: ResolvedUser,
  permissionKey: string,
): Promise<boolean> {
  // Step 1 — Dangerous gate (applies to ALL roles including ADMIN)
  if (DANGEROUS_PERMISSIONS.has(permissionKey)) {
    const explicitDeny = user.userPermissions.find(
      (p) => p.permission.key === permissionKey && !p.granted,
    );
    if (explicitDeny) return false;

    const explicitGrant = user.userPermissions.find(
      (p) => p.permission.key === permissionKey && p.granted,
    );
    return !!explicitGrant;
  }

  // Step 2 — ADMIN bypass (non-dangerous only)
  if (user.role === "ADMIN") return true;

  // Step 3 — Explicit deny
  const deny = user.userPermissions.find(
    (p) => p.permission.key === permissionKey && !p.granted,
  );
  if (deny) return false;

  // Step 4 — Explicit grant
  const grant = user.userPermissions.find(
    (p) => p.permission.key === permissionKey && p.granted,
  );
  if (grant) return true;

  // Step 5 — Role defaults
  const defaults = await getRoleDefaults(user.role);
  if (defaults.has(permissionKey)) return true;

  // Step 6 — Deny by default
  return false;
}
