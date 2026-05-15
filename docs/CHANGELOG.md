# CHANGELOG

## Changelog Rules

- Only completed and verified work should be listed.
- Do not add future planned work.
- If a change is inferred from documentation but not independently verified in code, avoid wording it as fully implemented.
- ROADMAP items must not appear here unless implemented.

## 2026-05

### Foundation
- Established Next.js App Router application structure
- Added TypeScript, Tailwind, and ESLint baseline
- Created scalable project architecture for app, components, services, types, and Prisma
- Aligned runtime architecture to Prisma + Supabase PostgreSQL + Vercel
- Added fail-fast environment validation

### CRM
- Implemented single internal authentication flow
- Added protected application shell
- Implemented customer CRUD
- Added customer lifecycle status flow
- Added customer note and task linkage foundations
- Added Turkish location selection layer for customer records

### Quote System
- Implemented quote workflow v1
- Added quote creation
- Added quote listing
- Added quote editing
- Added quote detail page
- Added PDF quote generation
- Added WhatsApp quote sharing
- Added quote currency mode and exchange-rate aware display behavior
- Improved legacy quote compatibility in tax display logic

### Relationship Engine
- Added category management
- Added product/category relationship structure
- Added attribute system
- Added product/customer interest linking
- Added category/customer relationship linking

### Tasking and Outreach
- Added task management foundations
- Added follow-up task structures and views
- Added outreach/campaign module foundation
- Added campaign listing and campaign detail flow

### Search and Activity
- Added search module
- Added activity timeline/module support

### Technical Hardening
- Removed SQLite runtime architecture
- Standardized on PostgreSQL-compatible Prisma runtime
- Added Prisma migration structure
- Fixed build safety issues caused by eager session secret loading
- Fixed build safety issues caused by eager database loading
- Expanded protected route coverage
- Tracked required location CSV files in repository

### Documentation Governance
- Created `docs/ROADMAP.md` as target architecture reference
- Created `docs/PROGRESS.md` as factual implementation reference
- Created `docs/NEXT-STEPS.md` as execution priority reference
- Created `docs/CHANGELOG.md` as factual history reference
- Created `docs/current-state.md`
- Created `docs/phase-plan.md`
