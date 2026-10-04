# CFO operating context — 2026-10-04

The protected working-status page uses the application's existing Prisma connection. It reports Entegra/XML historical row availability separately from data freshness and financial calculations, and includes active CFO notebook context in the snapshot. Notebook confidence, review dates, archive state and truncation are explicit. No notebook text is treated as executable instructions or automatically converted into verified cost figures.

Partial analysis is scoped per SKU/channel. A missing product cost does not disable independent sales, stock or known-cost observations. Known cost alone does not prove contribution profit or authorize price recommendations. Explicitly inactive catalog entries are excluded from new recommendation scope; missing cost is not interpreted as unwanted stock. Suggested cost questions are consolidated per selling SKU, and are not persisted.

Read-only admin endpoints and page require ADMIN plus CFO_READ and EXECUTIVE_READ. Queries run inside a repeatable-read, read-only transaction with statement timeout and savepoint isolation for optional sources. The JSON API uses private/no-store caching and never accepts SQL, credentials, product overrides or release flags. No provider calls, financial writes, migration, new database connection or release/acceptance approval are enabled.

The coding environment and deployed application are distinct: application runtime access does not grant the assistant a browser session or database credential. Direct assistant reading requires an authorized credential configured privately in the execution environment, ideally a scoped read-only role against the existing database. Credentials must not be placed in the repository or ordinary chat text. This change does not provision that access.

Validation: actual PGlite read-only notebook SQL, confidence/expiry/archive/truncation, independently unavailable sources, partial known-cost scope, inactive exclusion and one question per SKU. TypeScript/lint and CI build/access gates cover the new routes.

Technical delta is kept in this dedicated document and CHANGELOG-BANK-UPLOAD.md rather than republishing the large existing PDKS/CHANGELOG documents previously rejected by automatic review for private business content. No production financial values, original files or notebook contents are committed.

## Authorized assistant reader setup

Reuse the existing database and scoped `cfo_acceptance_reader` role. Its grants must cover the catalog-confirmed CFO views/functions, product/sales/XML sources and the existing `cfo_note`, `cfo_question`, bank-movement and audit tables required for inspection. Do not grant business-data write privileges. Reader access checks now list these context sources as well.

Configure `CFO_READER_DATABASE_URL` privately in the coding environment, using the existing Supabase session-pooler reader URI accepted by `cfoReaderOptions`. Run `node --conditions=react-server --import tsx scripts/cfo-read-context.ts`. The CLI verifies restricted role/TLS/default read-only mode, queries inside a repeatable-read/read-only transaction, and writes the business report only to a mode-0600 file in `/tmp`. Standard output contains a local path or fixed diagnostic code; no URI, password, notebook contents or financial results are logged. The tool cannot perform bank repairs; those need separately authorized application writes.

Existing TRY, USD and import USD cost fields are included separately in the private context. If a cost is already recorded but absent from the financial signal, the report asks for matching/dated conversion rather than cost re-entry. USD values are never silently treated as TRY.
