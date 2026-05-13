# IOTOMASYON TASKS

Project: Internal private CRM + product tracking system
Deployment target: GitHub + Vercel
Implementation stack: Next.js + TypeScript + Tailwind + Prisma + PostgreSQL + Zustand + Zod + React Hook Form

RULE:
Complete tasks in exact order.
Do NOT skip phases.
Do NOT add features outside scope.
After each completed task:
1. commit changes
2. explain what was done
3. list next blockers

---

# PHASE 0 - PROJECT FOUNDATION

## TASK 0.1
Initialize project

Acceptance criteria:
- Next.js latest installed
- TypeScript enabled
- Tailwind configured
- ESLint configured
- app router enabled
- clean project structure

Deliverables:
- working local dev server
- first Git commit

Status: DONE

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
/prisma
/docs

Acceptance:
Clean scalable architecture exists

Status: DONE

---

## TASK 0.3
Environment setup

Create:
.env.example

Variables:
DATABASE_URL
DIRECT_URL
SESSION_SECRET
ADMIN_EMAIL
ADMIN_PASSWORD

Acceptance:
Environment config ready

Status: DONE

---

# PHASE 1 - DATABASE

## TASK 1.1
Design database schema

Create tables:

users
products
customers
product_interests
notes
follow_up_tasks

Acceptance:
Prisma schema and SQL source-of-truth file exist

Status: DONE

---

# PHASE 2 - AUTH

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

Status: DONE

---

## TASK 2.2
Protected routes

Protect:
dashboard
products
customers
relationships
tasks
settings

Acceptance:
unauthenticated users redirected

Status: DONE

---

# PHASE 3 - UI FRAMEWORK

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
Relationships
Tasks
Search
Settings

Acceptance:
navigation shell works

Status: DONE

---

# PHASE 4 - PRODUCT SYSTEM

## TASK 4.1
Product CRUD

Fields:
SKU
name
category
brand
model
stock_quantity
minimum_stock
location
description
is_active

Features:
create
edit
delete
search
filter

Acceptance:
products manageable

Status: DONE

---

## TASK 4.2
Product listing improvements

Features:
table view
search
sort
pagination

Acceptance:
fast product browsing

Status: NEXT

---

# NEXT PHASE CANDIDATES

1. Customer CRUD
2. Product-customer relationship tracking
3. Notes timeline
4. Follow-up task reminders
5. Global search
6. Stock movement history
