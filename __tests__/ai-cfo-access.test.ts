import assert from "node:assert/strict";
import { cfoReaderOptions, cfoAccessFailure, CfoAccessError } from "../lib/cfo-agent/access-check";

// Reader connection options and failure tags (ported from the parked feat/ai-cfo-v1 branch). The live catalog checks of
// checkCfoReaderAccess run against real PostgreSQL in cfo-reader-security.test.ts. Fixture credentials are fictional.
// Run with: node --conditions=react-server --import tsx __tests__/ai-cfo-access.test.ts
const code = (fn: () => unknown) => { try { fn(); return "ok"; } catch (e) { return e instanceof CfoAccessError ? e.code : "other"; } };
const prefix = "postgresql://cfo_acceptance_reader.abcdefghijklmnopqrst:";
const suffix = "@aws-1-eu-north-1.pooler.supabase.com:5432/postgres";

assert.equal(code(() => cfoReaderOptions(undefined)), "secret_missing");
assert.equal(code(() => cfoReaderOptions("   ")), "secret_missing");
assert.equal(code(() => cfoReaderOptions("not a uri")), "invalid_database_uri");
assert.equal(code(() => cfoReaderOptions("mysql://cfo_acceptance_reader.abcdefghijklmnopqrst:x" + suffix)), "invalid_database_uri");
// master role / direct host / transaction pooler are refused
assert.equal(code(() => cfoReaderOptions("postgresql://postgres:fixture@db.example.com:5432/postgres")), "session_pooler_required");
assert.equal(code(() => cfoReaderOptions(prefix + "fixture@aws-1-eu-north-1.pooler.supabase.com:6543/postgres")), "session_pooler_required");
assert.equal(code(() => cfoReaderOptions("postgresql://postgres.abcdefghijklmnopqrst:fixture" + suffix)), "reader_username_required");
// placeholder passwords from setup instructions never connect
assert.equal(code(() => cfoReaderOptions(prefix + "BURAYA_YENI_SIFREN" + suffix)), "password_placeholder");
assert.equal(code(() => cfoReaderOptions(prefix + "[YOUR-PASSWORD]" + suffix)), "password_placeholder");
// TLS verification cannot be disabled through the URI
const opts = cfoReaderOptions(prefix + "fictional-fixture" + suffix + "?sslmode=disable");
assert.deepEqual(opts.ssl, { rejectUnauthorized: true });
assert.equal(opts.port, 5432);
assert.equal(opts.user, "cfo_acceptance_reader.abcdefghijklmnopqrst");
// only fixed tags leave the process; driver text (which may contain hosts/users) never does
const sensitive = "password authentication failed for user cfo_acceptance_reader at db.internal";
assert.equal(cfoAccessFailure({ code: "28P01", message: sensitive }), "authentication_failed");
assert.equal(cfoAccessFailure({ code: "SELF_SIGNED_CERT_IN_CHAIN" }), "tls_certificate_error");
assert.equal(cfoAccessFailure({ code: "ENOTFOUND" }), "hostname_unresolved");
assert.equal(cfoAccessFailure({ code: "ECONNREFUSED" }), "network_connection_failed");
assert.equal(cfoAccessFailure({ code: "42501" }), "source_permission_denied");
assert.equal(cfoAccessFailure({ code: "57014" }), "query_timeout");
assert.equal(cfoAccessFailure({ message: "Tenant or user not found" }), "pooler_user_unknown");
assert.equal(cfoAccessFailure({ message: sensitive }), "connection_check_failed");
assert.equal(cfoAccessFailure(new CfoAccessError("reader_role_required")), "reader_role_required");
assert.equal(cfoAccessFailure(null), "connection_check_failed");
console.log("AI CFO reader access: session pooler + reader role only, placeholders refused, TLS enforced, fixed failure tags passed");
