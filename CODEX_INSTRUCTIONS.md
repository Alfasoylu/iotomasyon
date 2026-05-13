# CODEX INSTRUCTIONS — IOTOMASYON

## Mission

Build IOTOMASYON as a private internal CRM + product tracking system for Soylu Elektronik.

This is NOT a public SaaS.
This is NOT an ERP clone.
This is NOT a marketplace integration project.

Core problem:

Which customer is interested in which product, what is the stock status, and who should be followed up when the product is available?

---

## Absolute Rules

1. Follow PROJECT_MASTER.md
2. Follow TASKS.md in exact order
3. Follow DATABASE_SCHEMA.sql
4. Do not create features outside active task
5. Do not invent business logic
6. Do not add features unless explicitly approved
7. No public registration
8. No accounting
9. No invoicing
10. No cargo/shipping systems
11. No marketplace integrations
12. No payment gateway
13. No WhatsApp automation
14. No AI chatbot
15. Keep system simple
16. Keep system fast
17. Keep system usable
18. Every task must be buildable
19. Every task must be deployable

---

## Tech Stack

Use ONLY:

- Next.js
- TypeScript
- TailwindCSS
- shadcn/ui
- Supabase
- PostgreSQL
- Vercel
- GitHub

DO NOT replace stack.

---

## Project Type

Private internal web application.

Internal team only.

NOT public.

NOT customer-facing.

Domain:

iotomasyon.com

Hosting:

Vercel

Repository:

Private GitHub repo

---

## Core Business Logic

Main purpose:

Track:

- products
- customers
- product interest
- follow-ups
- stock movements
- notes

Main question system must answer instantly:

- Which customer wants this product?
- Is product in stock?
- Who should be called when stock arrives?
- What happened in previous conversations?
- What products does this customer care about?

---

## Database Source of Truth

DATABASE_SCHEMA.sql

Never invent schema outside this file unless approved.

Main tables:

- profiles
- products
- customers
- interests
- notes
- stock_movements

Views:

- upcoming_followups
- waiting_stock_customers
- low_stock_products

Functions:

- update_product_stock()

---

## Authentication Rules

Use Supabase Auth.

Allowed:

- email/password login
- logout
- session persistence
- protected routes

Forbidden:

- public signup
- Google login
- social login
- anonymous login
- customer login

Only internal users.

---

## Core Pages

Allowed MVP pages:

/login
/dashboard
/products
/products/[id]
/customers
/customers/[id]
/interests
/stock
/settings

DO NOT create marketing pages.

DO NOT create public homepage.

---

## Product Rules

Each product must support:

- SKU
- name
- category
- brand
- model
- stock_quantity
- minimum_stock
- location
- description
- active status

Product list must support:

- search by SKU
- search by name
- filter by category
- low stock warning
- sorting
- pagination

---

## Customer Rules

Each customer must support:

- name
- phone
- email
- company
- customer_type
- city
- district
- address
- tax_office
- tax_number
- source
- active status

Customer page must show:

- basic info
- interest history
- notes
- follow-up history

---

## Interest Rules

Definition:

Interest = customer interested in product

Each interest supports:

- customer
- product
- quantity_requested
- target_price
- quoted_price
- priority
- status
- follow_up_date
- note
- assigned user

Allowed statuses:

- new
- waiting_stock
- contacted
- quoted
- won
- lost
- cancelled

Allowed priorities:

- low
- normal
- high
- urgent

---

## Stock Rules

Stock changes must be controlled.

Never allow negative stock.

Every stock change must create movement history.

Use:

update_product_stock()

Movement types:

- incoming
- outgoing
- adjustment
- reserved
- released

---

## Notes Rules

Notes may attach to:

- customer
- product
- interest

At least one relation required.

Notes should be timeline-style where relevant.

---

## Import / Export Rules

MVP supports:

Import:

- products Excel
- customers Excel

Export:

- products
- customers
- interests

No advanced mapping UI.

Simple templates only.

---

## UI / UX Rules

Priority:

1. speed
2. clarity
3. minimal clicks
4. desktop-first
5. mobile usable

Target users:

- sales team
- warehouse team
- internal management

User should find:

- product < 5 sec
- customer < 5 sec

---

## Code Quality Rules

Required:

- strict TypeScript
- reusable components
- clean architecture
- small functions
- typed code
- proper loading states
- proper error states
- proper empty states

Forbidden:

- dead code
- demo junk
- fake placeholders
- overengineering
- giant files
- business logic in UI

---

## Commit Rules

After every task:

1. run build
2. fix errors
3. commit

Format:

phase-task: short description

Examples:

phase-0.1: initialize project
phase-1.1: add database schema
phase-4.1: implement product crud

---

## Completion Report Format

After each task output:

## Completed Task

TASK X.X

## What Changed

- item

## Files Changed

- file

## Verification

- result

## Next Task

TASK X.X

## Blockers

None / blockers

---

## MVP Success Criteria

MVP is successful only if:

- login works
- auth protection works
- product CRUD works
- customer CRUD works
- interest matching works
- waiting stock list works
- follow-up list works
- stock movement system works
- import/export works
- deploy works
- app works on iotomasyon.com

---

## Final Rule

Do NOT build impressive software.

Build useful software.

Complexity is failure.