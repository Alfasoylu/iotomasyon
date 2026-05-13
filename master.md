# IOTOMASYON PROJECT MASTER DOCUMENT

## Project Name
IOTOMASYON Internal CRM

## Mission
Soylu Elektronik internal product-customer tracking system.

NOT a public SaaS.
NOT an ERP clone.
NOT multi-tenant.

Internal private operational dashboard only.

Purpose:
Track products, customers, product interests, stock status, and follow-up actions.

Main business use case:
A customer asks for a product.
Product may be out of stock.
We want to remember:
- which customer wanted which product
- follow-up notes
- when stock arrives, whom to call
- sales history
- repeat opportunities

---

## Core Rule
SIMPLE > SMART

Never overengineer.

If a simpler solution exists, choose it.

---

## Tech Stack

Frontend:
- Next.js latest
- TypeScript
- TailwindCSS
- shadcn/ui

Backend:
- Supabase

Database:
- PostgreSQL (Supabase)

Hosting:
- Vercel

Code:
- GitHub private repository

Domain:
- iotomasyon.com

Authentication:
- Email/password only

Users:
Internal only:
- Alperen
- team members

No public registration.

---

## MVP Scope

Included:

1. Authentication
2. Dashboard
3. Product management
4. Customer management
5. Product-customer interest matching
6. Follow-up reminders
7. Notes system
8. Stock status
9. Search/filter
10. Excel import/export

Excluded:
- marketplace integrations
- accounting
- payment systems
- invoicing
- multi-language
- public website
- API marketplace sync
- AI chatbot
- advanced analytics

---

## Database Schema

products
- id
- sku
- name
- category
- stock_quantity
- minimum_stock
- created_at

customers
- id
- name
- phone
- email
- company
- created_at

interests
- id
- customer_id
- product_id
- quantity_requested
- priority
- follow_up_date
- status
- created_at

notes
- id
- customer_id
- product_id
- note
- created_by
- created_at

stock_movements
- id
- product_id
- type
- quantity
- reason
- created_at

users
- id
- email
- role
- created_at

---

## UX Rules

Fast.
Minimal clicks.
Desktop-first.
Mobile usable.

Target user:
warehouse + sales staff

---

## Security Rules

Private internal app.
Authenticated access only.
No public exposure.

---

## Coding Rules

Use clean architecture.
Use TypeScript strict mode.
Reusable components only.
No dead code.
No mock features in production.
Every feature must be deployable.

---

## Deployment Rules

Auto deploy via Vercel.
Production domain:
iotomasyon.com

Environment variables managed securely.

---

## Success Criteria

System is successful if:
- a product can be found in <5 sec
- customer history visible instantly
- stock arrival triggers easy follow-up
- no Excel dependency

---

## Forbidden Scope

Never add:
- ERP complexity
- accounting
- shipping integrations
- marketplace sync
unless explicitly approved later.