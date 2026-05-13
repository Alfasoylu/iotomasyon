-- =========================================================
-- IOTOMASYON DATABASE SCHEMA
-- Phase 1 implementation source of truth
-- Runtime: Prisma ORM + SQLite
-- Migration target: PostgreSQL later
-- =========================================================

-- Historical note:
-- Earlier planning documents referenced Supabase/PostgreSQL.
-- Phase 1 now runs on Prisma with SQLite for fast internal MVP delivery.
-- The schema below preserves the same CRM domain model while keeping the
-- table design portable for a later PostgreSQL migration.

-- =========================================================
-- USERS
-- Single admin login initially.
-- =========================================================

create table if not exists users (
  id text primary key,
  email text not null unique,
  password_hash text not null,
  name text not null,
  role text not null default 'ADMIN',
  is_active integer not null default 1,
  created_at text not null default current_timestamp,
  updated_at text not null default current_timestamp
);

create index if not exists idx_users_email on users(email);

-- =========================================================
-- PRODUCTS
-- =========================================================

create table if not exists products (
  id text primary key,
  sku text not null unique,
  name text not null,
  category text,
  brand text,
  model text,
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  minimum_stock integer not null default 0 check (minimum_stock >= 0),
  location text,
  description text,
  is_active integer not null default 1,
  created_by_id text references users(id) on delete set null,
  created_at text not null default current_timestamp,
  updated_at text not null default current_timestamp
);

create index if not exists idx_products_name on products(name);
create index if not exists idx_products_category on products(category);
create index if not exists idx_products_stock on products(stock_quantity, minimum_stock);

-- =========================================================
-- CUSTOMERS
-- Planned for next phase.
-- =========================================================

create table if not exists customers (
  id text primary key,
  name text not null,
  phone text,
  email text,
  company text,
  customer_type text,
  city text,
  district text,
  address text,
  tax_office text,
  tax_number text,
  source text,
  is_active integer not null default 1,
  created_at text not null default current_timestamp,
  updated_at text not null default current_timestamp
);

create index if not exists idx_customers_name on customers(name);
create index if not exists idx_customers_phone on customers(phone);
create index if not exists idx_customers_email on customers(email);

-- =========================================================
-- PRODUCT INTERESTS
-- Which customer is interested in which product?
-- Planned in later phase, included now to stabilize schema direction.
-- =========================================================

create table if not exists product_interests (
  id text primary key,
  customer_id text not null references customers(id) on delete cascade,
  product_id text not null references products(id) on delete cascade,
  quantity_requested integer not null default 1 check (quantity_requested > 0),
  target_price decimal(12,2),
  quoted_price decimal(12,2),
  priority text not null default 'NORMAL',
  status text not null default 'NEW',
  follow_up_at text,
  last_contacted_at text,
  closed_at text,
  source text,
  note text,
  created_by_id text references users(id) on delete set null,
  assigned_to_id text references users(id) on delete set null,
  created_at text not null default current_timestamp,
  updated_at text not null default current_timestamp
);

create index if not exists idx_interests_customer_id on product_interests(customer_id);
create index if not exists idx_interests_product_id on product_interests(product_id);
create index if not exists idx_interests_status on product_interests(status);
create index if not exists idx_interests_priority on product_interests(priority);
create index if not exists idx_interests_follow_up on product_interests(follow_up_at);

-- =========================================================
-- NOTES
-- Notes can attach to customer, product, or interest.
-- =========================================================

create table if not exists notes (
  id text primary key,
  content text not null,
  customer_id text references customers(id) on delete cascade,
  product_id text references products(id) on delete cascade,
  interest_id text references product_interests(id) on delete cascade,
  created_by_id text references users(id) on delete set null,
  created_at text not null default current_timestamp
);

create index if not exists idx_notes_customer_id on notes(customer_id);
create index if not exists idx_notes_product_id on notes(product_id);
create index if not exists idx_notes_interest_id on notes(interest_id);

-- =========================================================
-- FOLLOW UP TASKS
-- Phase 1 schema-ready, app module pending.
-- =========================================================

create table if not exists follow_up_tasks (
  id text primary key,
  title text not null,
  details text,
  status text not null default 'PENDING',
  due_at text,
  completed_at text,
  customer_id text references customers(id) on delete cascade,
  product_id text references products(id) on delete cascade,
  assigned_to_id text references users(id) on delete set null,
  created_by_id text references users(id) on delete set null,
  created_at text not null default current_timestamp,
  updated_at text not null default current_timestamp
);

create index if not exists idx_follow_up_tasks_status on follow_up_tasks(status);
create index if not exists idx_follow_up_tasks_due_at on follow_up_tasks(due_at);

-- =========================================================
-- END OF FILE
-- =========================================================
