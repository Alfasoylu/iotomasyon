# IOTOMASYON TASKS

Project: Internal private CRM + product tracking system
Domain: iotomasyon.com
Stack: Next.js + TypeScript + Tailwind + shadcn/ui + Supabase + Vercel
Repository: GitHub private

RULE:
Complete tasks in exact order.
Do NOT skip phases.
Do NOT add features outside scope.
After each completed task:
1. commit changes
2. explain what was done
3. list next blockers

---

# PHASE 0 — PROJECT FOUNDATION

## TASK 0.1
Initialize project

Acceptance criteria:
- Next.js latest installed
- TypeScript enabled
- Tailwind configured
- shadcn/ui installed
- ESLint configured
- app router enabled
- clean project structure

Deliverables:
- working local dev server
- first Git commit

Status: PENDING

---

## TASK 0.2
Setup folder architecture

Create:

/app
/components
/lib
/types
/hooks
/services
/utils
/supabase
/docs

Acceptance:
Clean scalable architecture exists

Status: PENDING

---

## TASK 0.3
Environment setup

Create:
.env.example

Variables:
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

Acceptance:
Environment config ready

Status: PENDING

---

# PHASE 1 — DATABASE

## TASK 1.1
Design database schema

Create tables:

products
customers
interests
notes
stock_movements
profiles

Acceptance:
SQL migration file exists

Status: PENDING

---

## TASK 1.2
Supabase setup

Tasks:
- connect project
- verify database access
- test insert/select

Acceptance:
Supabase connected successfully

Status: PENDING

---

## TASK 1.3
Row level security

Rules:
authenticated users only

Acceptance:
public access blocked

Status: PENDING

---

# PHASE 2 — AUTH

## TASK 2.1
Login system

Features:
- email login
- password login
- logout
- session persistence

NO:
public signup

Acceptance:
internal users can log in

Status: PENDING

---

## TASK 2.2
Protected routes

Protect:
dashboard
products
customers
interests
settings

Acceptance:
unauthenticated users redirected

Status: PENDING

---

# PHASE 3 — UI FRAMEWORK

## TASK 3.1
Main dashboard shell

Build:
- sidebar
- top navbar
- user menu
- responsive layout

Menu:
Dashboard
Products
Customers
Interests
Stock
Notes
Settings

Acceptance:
navigation works

Status: PENDING

---

# PHASE 4 — PRODUCT SYSTEM

## TASK 4.1
Product CRUD

Fields:
SKU
name
category
stock_quantity
minimum_stock

Features:
create
edit
delete
search
filter

Acceptance:
products manageable

Status: PENDING

---

## TASK 4.2
Product listing

Features:
table view
search
sort
pagination

Acceptance:
fast product browsing

Status: PENDING

---

# PHASE 5 — CUSTOMER SYSTEM

## TASK 5.1
Customer CRUD

Fields:
name
phone
email
company

Features:
create
edit
delete
search

Acceptance:
customer records manageable

Status: PENDING

---

## TASK 5.2
Customer profile page

Show:
basic info
notes
interested products
followups

Acceptance:
single customer history visible

Status: PENDING

---

# PHASE 6 — PRODUCT INTEREST MATCHING

## TASK 6.1
Interest system

Purpose:
match customer to product

Fields:
customer
product
quantity_requested
priority
status
follow_up_date

Acceptance:
product-customer relation works

Status: PENDING

---

## TASK 6.2
Interest dashboard

Views:
all interests
urgent followups
waiting stock
completed

Acceptance:
sales followup visibility

Status: PENDING

---

# PHASE 7 — NOTES SYSTEM

## TASK 7.1
Notes

Attach notes to:
customer
product
interest

Acceptance:
timeline history visible

Status: PENDING

---

# PHASE 8 — STOCK TRACKING

## TASK 8.1
Stock movement system

Track:
incoming
outgoing
manual adjustment

Acceptance:
stock updates correctly

Status: PENDING

---

## TASK 8.2
Low stock alerts

Logic:
stock < minimum_stock

Acceptance:
warning indicators visible

Status: PENDING

---

# PHASE 9 — IMPORT / EXPORT

## TASK 9.1
Excel import

Import:
products
customers

Acceptance:
bulk upload works

Status: PENDING

---

## TASK 9.2
Excel export

Export:
products
customers
interests

Acceptance:
download works

Status: PENDING

---

# PHASE 10 — SEARCH

## TASK 10.1
Global search

Search:
SKU
product
customer
phone
email

Acceptance:
results under 2 seconds

Status: PENDING

---

# PHASE 11 — DEPLOYMENT

## TASK 11.1
Vercel deployment

Tasks:
connect GitHub
production deploy

Acceptance:
live app works

Status: PENDING

---

## TASK 11.2
Custom domain

Connect:
iotomasyon.com

Acceptance:
domain active

Status: PENDING

---

# PHASE 12 — HARDENING

## TASK 12.1
Error handling

Add:
empty states
error states
loading states

Acceptance:
stable UX

Status: PENDING

---

## TASK 12.2
Security review

Check:
auth
db rules
api access
env vars

Acceptance:
internal secure app

Status: PENDING

---

# PHASE 13 — MVP RELEASE

## TASK 13.1
Final QA

Checklist:
login works
CRUD works
interest matching works
stock updates work
import/export works
deployment works

Acceptance:
usable internal MVP

Status: PENDING

---

# FORBIDDEN FEATURES

DO NOT BUILD:
- accounting
- invoicing
- payment gateway
- marketplace integrations
- whatsapp automation
- AI chatbot
- advanced analytics
- public registration
- SaaS billing

Only MVP internal system.

---

# SUCCESS METRICS

Success if:
- product searchable under 5 sec
- customer history instantly visible
- stock arrival followup possible
- repeat customer tracking works
- team can use daily
