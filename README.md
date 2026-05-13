# IOTOMASYON

Internal CRM and product tracking workspace for Soylu Elektronik.

Phase 1 currently includes:
- admin authentication
- protected dashboard shell
- product CRUD

This corrective architecture pass keeps the current UI and product flows, while aligning the data layer with Supabase PostgreSQL and Vercel deployment expectations.

## Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS v4
- Prisma ORM
- Supabase PostgreSQL
- Vercel

## Required Environment Variables

Create `.env.local` for local development:

```env
DATABASE_URL="postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres"
SESSION_SECRET="replace-with-a-random-32-plus-character-secret"
ADMIN_EMAIL="admin@example.com"
ADMIN_PASSWORD="replace-with-a-strong-password"
```

Variable notes:
- `DATABASE_URL`: pooled or runtime-safe connection string used by Prisma Client in the app
- `DIRECT_URL`: direct PostgreSQL connection string used by Prisma CLI and migrations
- `SESSION_SECRET`: at least 32 characters for JWT signing
- `ADMIN_EMAIL`: bootstrap admin email
- `ADMIN_PASSWORD`: bootstrap admin password

The app now fails fast if any required server env var is missing.

## Supabase Setup

1. Create a new Supabase project.
2. Open `Project Settings -> Database`.
3. Copy the pooled connection string into `DATABASE_URL`.
4. Copy the direct connection string into `DIRECT_URL`.
5. Set a strong `SESSION_SECRET`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD`.

Recommended:
- keep connection pooling enabled for runtime
- use the direct connection only for migrations and admin tooling

## Local Development

Install dependencies:

```bash
npm install
```

Apply the baseline Prisma migration to your Supabase database:

```bash
npm run db:migrate:deploy
```

Start the app:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

On the first successful login attempt, the system will create the initial admin user if no user exists yet.

## Prisma Workflow

Generate Prisma Client:

```bash
npm run db:generate
```

Create a new migration during future schema changes:

```bash
npm run db:migrate:dev -- --name your_change_name
```

Deploy migrations in CI or production:

```bash
npm run db:migrate:deploy
```

## Vercel Deployment

1. Push the repository to GitHub.
2. Import the project into Vercel.
3. Add these environment variables in Vercel for Production, Preview, and Development as needed:
   - `DATABASE_URL`
   - `DIRECT_URL`
   - `SESSION_SECRET`
   - `ADMIN_EMAIL`
   - `ADMIN_PASSWORD`
4. Deploy.

Notes:
- Vercel should point to Supabase PostgreSQL, not a local database file.
- `DIRECT_URL` is used by `prisma.config.ts` so migrations run against the direct Postgres connection.
- If you run migrations outside Vercel, keep the same schema history committed in `prisma/migrations`.

## Current Scope

Implemented:
- login/logout
- protected app shell
- dashboard stats
- product create/edit/delete/list/detail

Not implemented yet:
- customer CRUD
- relationship tracking
- notes
- follow-up tasks
- global search

## Verification

Architecture pass target:
- PostgreSQL-compatible Prisma datasource
- no SQLite runtime adapter
- no hardcoded fallback credentials
- fail-fast env validation
- real migration structure
