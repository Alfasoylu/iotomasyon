/**
 * login-rate-limit unit tests — run with: npx tsx __tests__/login-rate-limit.test.ts
 * No Jest/DB needed. "server-only" import'u Node'da hata verdiği için cache ile
 * boşaltılır (scripts/*.ts ile aynı yöntem).
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const req = createRequire(import.meta.url);
req.cache[req.resolve("server-only")] = {
  id: "server-only",
  filename: "server-only",
  loaded: true,
  exports: {},
} as never;

async function main() {
  const {
    checkLoginRateLimit,
    recordLoginFailure,
    recordLoginSuccess,
    _resetLoginRateLimitForTests,
    LOGIN_RATE_LIMIT,
  } = await import("../lib/login-rate-limit");

  let passed = 0;

  function test(name: string, fn: () => void) {
    _resetLoginRateLimitForTests();
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  }

  test("ilk deneme serbest", () => {
    assert.deepEqual(checkLoginRateLimit("1.1.1.1", "a@x.com"), { allowed: true });
  });

  test("e-posta başına MAX_PER_EMAIL başarısız denemeden sonra bloklanır", () => {
    for (let i = 0; i < LOGIN_RATE_LIMIT.MAX_PER_EMAIL; i++) {
      assert.equal(checkLoginRateLimit("1.1.1.1", "a@x.com").allowed, true);
      recordLoginFailure("1.1.1.1", "a@x.com");
    }
    const decision = checkLoginRateLimit("1.1.1.1", "a@x.com");
    assert.equal(decision.allowed, false);
    if (!decision.allowed) assert.ok(decision.retryAfterSec > 0);
  });

  test("e-posta bloğu başka IP'den de geçerli (hesap hedefli saldırı)", () => {
    for (let i = 0; i < LOGIN_RATE_LIMIT.MAX_PER_EMAIL; i++) recordLoginFailure(`10.0.0.${i}`, "a@x.com");
    assert.equal(checkLoginRateLimit("9.9.9.9", "a@x.com").allowed, false);
  });

  test("e-posta karşılaştırması büyük/küçük harf ve boşluk duyarsız", () => {
    for (let i = 0; i < LOGIN_RATE_LIMIT.MAX_PER_EMAIL; i++) recordLoginFailure("1.1.1.1", "A@X.com ");
    assert.equal(checkLoginRateLimit("2.2.2.2", "a@x.com").allowed, false);
  });

  test("IP başına MAX_PER_IP başarısız denemeden sonra farklı e-postalar da bloklanır", () => {
    for (let i = 0; i < LOGIN_RATE_LIMIT.MAX_PER_IP; i++) recordLoginFailure("5.5.5.5", `u${i}@x.com`);
    assert.equal(checkLoginRateLimit("5.5.5.5", "fresh@x.com").allowed, false);
    // Başka IP etkilenmez.
    assert.equal(checkLoginRateLimit("6.6.6.6", "fresh@x.com").allowed, true);
  });

  test("başarılı giriş e-posta sayacını sıfırlar, IP sayacını korur", () => {
    for (let i = 0; i < LOGIN_RATE_LIMIT.MAX_PER_EMAIL - 1; i++) recordLoginFailure("1.1.1.1", "a@x.com");
    recordLoginSuccess("a@x.com");
    for (let i = 0; i < LOGIN_RATE_LIMIT.MAX_PER_EMAIL - 1; i++) {
      assert.equal(checkLoginRateLimit("1.1.1.1", "a@x.com").allowed, true);
      recordLoginFailure("1.1.1.1", "a@x.com");
    }
    assert.equal(checkLoginRateLimit("1.1.1.1", "a@x.com").allowed, true);
  });

  console.log(`\n${passed} test geçti.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
