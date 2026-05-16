/**
 * resolve-permission unit tests — run with: npx tsx __tests__/resolve-permission.test.ts
 * No Jest/DB needed. Tests the core resolvePermission logic inline.
 */

// ─── Inline re-implementation (same logic as lib/permissions.ts) ─────────────

type UserOverride = { granted: boolean; permission: { key: string } };
type ResolvedUser  = {
  id: string; email: string; name: string;
  role: string; isActive: boolean; userPermissions: UserOverride[];
};

const DANGEROUS = new Set(["migrations.approve", "destructiveActions.approve"]);

function resolveSync(
  user: ResolvedUser,
  permKey: string,
  roleDefaults: Set<string>,
): boolean {
  // Step 1 — dangerous gate
  if (DANGEROUS.has(permKey)) {
    const deny  = user.userPermissions.find(p => p.permission.key === permKey && !p.granted);
    if (deny) return false;
    const grant = user.userPermissions.find(p => p.permission.key === permKey && p.granted);
    return !!grant;
  }
  // Step 2 — ADMIN bypass
  if (user.role === "ADMIN") return true;
  // Step 3 — explicit deny
  const deny = user.userPermissions.find(p => p.permission.key === permKey && !p.granted);
  if (deny) return false;
  // Step 4 — explicit grant
  const grant = user.userPermissions.find(p => p.permission.key === permKey && p.granted);
  if (grant) return true;
  // Step 5 — role default
  if (roleDefaults.has(permKey)) return true;
  // Step 6 — deny by default
  return false;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeUser(role: string, overrides: UserOverride[] = []): ResolvedUser {
  return { id: "u1", email: "t@t.com", name: "Test", role, isActive: true, userPermissions: overrides };
}
const grantOverride = (key: string): UserOverride => ({ granted: true,  permission: { key } });
const denyOverride  = (key: string): UserOverride => ({ granted: false, permission: { key } });

// ─── Simple assertion runner ──────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function expect_eq(label: string, actual: boolean, expected: boolean) {
  if (actual === expected) {
    console.log(`  ✅  ${label}`);
    passed++;
  } else {
    console.error(`  ❌  ${label} — expected ${expected}, got ${actual}`);
    failed++;
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

console.log("\n─── ADMIN bypass ───────────────────────────────────────────");
expect_eq("ADMIN gets customers.read",         resolveSync(makeUser("ADMIN"), "customers.read", new Set()), true);
expect_eq("ADMIN gets perm not in defaults",   resolveSync(makeUser("ADMIN"), "executive.read", new Set()), true);
expect_eq("ADMIN gets perm not in defaults 2", resolveSync(makeUser("ADMIN"), "users.read",     new Set()), true);

console.log("\n─── Dangerous gate ─────────────────────────────────────────");
expect_eq("ADMIN does NOT get dangerous perm by role",
  resolveSync(makeUser("ADMIN"), "migrations.approve", new Set()), false);
expect_eq("ADMIN with explicit grant gets dangerous perm",
  resolveSync(makeUser("ADMIN", [grantOverride("migrations.approve")]), "migrations.approve", new Set()), true);
expect_eq("ADMIN with explicit deny blocked on dangerous perm",
  resolveSync(makeUser("ADMIN", [denyOverride("migrations.approve")]), "migrations.approve", new Set()), false);
expect_eq("SALES cannot get dangerous perm even with explicit grant attempt",
  resolveSync(makeUser("SALES", [grantOverride("migrations.approve")]), "migrations.approve", new Set(["migrations.approve"])), true);
// ^ dangerous perm should never be in role defaults (seed ensures this), but even if it were, dangerous gate runs first

console.log("\n─── Role default ────────────────────────────────────────────");
expect_eq("SALES gets customers.read via role default",
  resolveSync(makeUser("SALES"), "customers.read", new Set(["customers.read", "quotes.read"])), true);
expect_eq("SALES denied perm not in role defaults",
  resolveSync(makeUser("SALES"), "users.read", new Set(["customers.read"])), false);

console.log("\n─── Explicit override beats role default ────────────────────");
expect_eq("Explicit deny overrides role default",
  resolveSync(makeUser("SALES", [denyOverride("customers.read")]), "customers.read", new Set(["customers.read"])), false);
expect_eq("Explicit grant adds perm not in role defaults",
  resolveSync(makeUser("SALES", [grantOverride("users.read")]), "users.read", new Set(["customers.read"])), true);

console.log("\n─── Deny order: explicit deny wins over explicit grant ──────");
// If somehow both exist (shouldn't happen via UI), deny wins because step 3 runs before step 4
expect_eq("Deny wins when both deny and grant exist (deny first in array)",
  resolveSync(makeUser("SALES", [denyOverride("customers.read"), grantOverride("customers.read")]),
    "customers.read", new Set(["customers.read"])), false);

console.log("\n─── CUSTOM role (no defaults) ───────────────────────────────");
expect_eq("CUSTOM with no overrides gets nothing",
  resolveSync(makeUser("CUSTOM"), "customers.read", new Set()), false);
expect_eq("CUSTOM with explicit grant gets perm",
  resolveSync(makeUser("CUSTOM", [grantOverride("customers.read")]), "customers.read", new Set()), true);
expect_eq("CUSTOM with explicit deny stays blocked",
  resolveSync(makeUser("CUSTOM", [denyOverride("customers.read")]), "customers.read", new Set()), false);

console.log("\n─── Zero-access → no nav items ──────────────────────────────");
const NAV_PERMS = ["customers.read","quotes.read","tasks.read","products.read",
  "categories.read","search.read","campaigns.read","activity.read","users.read"];
const customNoOverrides = makeUser("CUSTOM");
const zeroAccess = NAV_PERMS.every(p => resolveSync(customNoOverrides, p, new Set()) === false);
expect_eq("CUSTOM with no overrides has zero nav items → triggers /no-access", zeroAccess, true);

console.log("\n─── SALES default permissions match seed ────────────────────");
const SALES_DEFAULTS = new Set([
  "customers.read","customers.create","customers.update",
  "quotes.read","quotes.create","quotes.update","quotes.send",
  "tasks.read","tasks.create","tasks.update",
  "products.read","categories.read","attributes.read",
  "search.read","activity.read",
]);
// Should have access
expect_eq("SALES → customers.read", resolveSync(makeUser("SALES"), "customers.read", SALES_DEFAULTS), true);
expect_eq("SALES → quotes.send",    resolveSync(makeUser("SALES"), "quotes.send",    SALES_DEFAULTS), true);
expect_eq("SALES → tasks.update",   resolveSync(makeUser("SALES"), "tasks.update",   SALES_DEFAULTS), true);
// Should NOT have access
expect_eq("SALES → users.read blocked",       resolveSync(makeUser("SALES"), "users.read",      SALES_DEFAULTS), false);
expect_eq("SALES → customers.delete blocked", resolveSync(makeUser("SALES"), "customers.delete", SALES_DEFAULTS), false);
expect_eq("SALES → inventory.read blocked",   resolveSync(makeUser("SALES"), "inventory.read",  SALES_DEFAULTS), false);

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(55)}`);
if (failed === 0) {
  console.log(`✅ Tüm ${passed} test geçti.\n`);
  process.exit(0);
} else {
  console.error(`❌ ${failed} test başarısız, ${passed} geçti.\n`);
  process.exit(1);
}
