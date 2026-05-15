# AI Rules

## Document Read Order

1. `docs/PROGRESS.md`
2. `docs/current-state.md`
3. `docs/DATABASE-SCHEMA-STATE.md`
4. `prisma/schema.prisma`
5. `docs/ROADMAP.md`
6. `docs/phase-plan.md`
7. `docs/NEXT-STEPS.md`
8. `docs/PERMISSION-MODEL.md` (when created)

## Core Rules

- roadmap ≠ implemented
- progress = factual implementation only
- actual code/schema reality overrides documentation assumptions
- if docs conflict with code, code wins and docs must be corrected
- never assume missing schema exists
- never mark incomplete work complete
- dependency-first implementation only
- never create migrations without checking both `docs/DATABASE-SCHEMA-STATE.md` and `prisma/schema.prisma`
- role field ≠ RBAC implementation

## Dangerous Operations

Never do without explicit approval:
- destructive migrations
- schema deletions
- production data rewrites
- write-side marketplace integrations
- auth rewrites
- permission model replacement

## Marketplace Rules

Allowed:
- read-only integrations

Forbidden until explicit approval:
- stock push
- price push
- listing updates
- order status writes

## Documentation Rules

If implementation changes:
update:
- `docs/PROGRESS.md`
- `docs/current-state.md`
- `docs/CHANGELOG.md`

If architecture changes:
update:
- `docs/ROADMAP.md`
- `docs/phase-plan.md`

## Verification Rules

Before claiming done:
- build
- typecheck
- lint
- prisma validation
- route protection checks
