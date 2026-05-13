-- =========================================================
-- IOTOMASYON DATABASE SCHEMA
-- Internal CRM + Product Tracking System
-- Stack: Supabase PostgreSQL
-- Purpose:
-- Track products, customers, product interests, notes,
-- stock movements, and follow-ups.
-- =========================================================

-- WARNING:
-- This schema is for internal private use only.
-- Do NOT add accounting, invoicing, marketplace sync,
-- payment, or public SaaS logic at MVP stage.

-- =========================================================
-- EXTENSIONS
-- =========================================================

create extension if not exists "pgcrypto";

-- =========================================================
-- ENUM TYPES
-- =========================================================

do $$ begin
  create type user_role as enum ('admin', 'manager', 'staff');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type interest_status as enum (
    'new',
    'waiting_stock',
    'contacted',
    'quoted',
    'won',
    'lost',
    'cancelled'
  );
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type interest_priority as enum ('low', 'normal', 'high', 'urgent');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type stock_movement_type as enum (
    'incoming',
    'outgoing',
    'adjustment',
    'reserved',
    'released'
  );
exception
  when duplicate_object then null;
end $$;

-- =========================================================
-- UPDATED_AT TRIGGER FUNCTION
-- =========================================================

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- =========================================================
-- PROFILES
-- Connected to Supabase auth.users
-- =========================================================

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text unique,
  role user_role not null default 'staff',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_profiles_updated_at on profiles;
create trigger trg_profiles_updated_at
before update on profiles
for each row execute function set_updated_at();

-- =========================================================
-- PRODUCTS
-- =========================================================

create table if not exists products (
  id uuid primary key default gen_random_uuid(),

  sku text not null unique,
  name text not null,
  category text,
  brand text,
  model text,

  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  minimum_stock integer not null default 0 check (minimum_stock >= 0),

  location text,
  description text,
  is_active boolean not null default true,

  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_products_sku on products(sku);
create index if not exists idx_products_name on products using gin (to_tsvector('simple', name));
create index if not exists idx_products_category on products(category);
create index if not exists idx_products_low_stock on products(stock_quantity, minimum_stock);

drop trigger if exists trg_products_updated_at on products;
create trigger trg_products_updated_at
before update on products
for each row execute function set_updated_at();

-- =========================================================
-- CUSTOMERS
-- =========================================================

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),

  name text not null,
  phone text,
  email text,
  company text,

  customer_type text default 'retail',
  city text,
  district text,
  address text,

  tax_office text,
  tax_number text,

  source text,
  is_active boolean not null default true,

  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint customers_phone_or_email_check
    check (phone is not null or email is not null or company is not null)
);

create index if not exists idx_customers_name on customers using gin (to_tsvector('simple', name));
create index if not exists idx_customers_phone on customers(phone);
create index if not exists idx_customers_email on customers(email);
create index if not exists idx_customers_company on customers(company);
create index if not exists idx_customers_city on customers(city);

drop trigger if exists trg_customers_updated_at on customers;
create trigger trg_customers_updated_at
before update on customers
for each row execute function set_updated_at();

-- =========================================================
-- INTERESTS
-- Product-customer matching table
-- Main purpose:
-- "Which customer wants which product?"
-- =========================================================

create table if not exists interests (
  id uuid primary key default gen_random_uuid(),

  customer_id uuid not null references customers(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,

  quantity_requested integer not null default 1 check (quantity_requested > 0),
  target_price numeric(12,2),
  quoted_price numeric(12,2),

  priority interest_priority not null default 'normal',
  status interest_status not null default 'new',

  follow_up_date date,
  last_contacted_at timestamptz,
  closed_at timestamptz,

  source text,
  note text,

  created_by uuid references profiles(id) on delete set null,
  assigned_to uuid references profiles(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_interests_customer_id on interests(customer_id);
create index if not exists idx_interests_product_id on interests(product_id);
create index if not exists idx_interests_status on interests(status);
create index if not exists idx_interests_priority on interests(priority);
create index if not exists idx_interests_follow_up_date on interests(follow_up_date);
create index if not exists idx_interests_assigned_to on interests(assigned_to);

drop trigger if exists trg_interests_updated_at on interests;
create trigger trg_interests_updated_at
before update on interests
for each row execute function set_updated_at();

-- =========================================================
-- NOTES
-- Notes can be attached to customer, product, or interest.
-- At least one relation must exist.
-- =========================================================

create table if not exists notes (
  id uuid primary key default gen_random_uuid(),

  customer_id uuid references customers(id) on delete cascade,
  product_id uuid references products(id) on delete cascade,
  interest_id uuid references interests(id) on delete cascade,

  note text not null,

  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),

  constraint notes_relation_check
    check (
      customer_id is not null
      or product_id is not null
      or interest_id is not null
    )
);

create index if not exists idx_notes_customer_id on notes(customer_id);
create index if not exists idx_notes_product_id on notes(product_id);
create index if not exists idx_notes_interest_id on notes(interest_id);
create index if not exists idx_notes_created_at on notes(created_at desc);

-- =========================================================
-- STOCK MOVEMENTS
-- =========================================================

create table if not exists stock_movements (
  id uuid primary key default gen_random_uuid(),

  product_id uuid not null references products(id) on delete cascade,

  movement_type stock_movement_type not null,
  quantity integer not null check (quantity > 0),

  previous_quantity integer not null check (previous_quantity >= 0),
  new_quantity integer not null check (new_quantity >= 0),

  reason text,
  reference_code text,

  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_stock_movements_product_id on stock_movements(product_id);
create index if not exists idx_stock_movements_type on stock_movements(movement_type);
create index if not exists idx_stock_movements_created_at on stock_movements(created_at desc);

-- =========================================================
-- FOLLOW UP VIEW
-- =========================================================

create or replace view upcoming_followups as
select
  i.id as interest_id,
  i.follow_up_date,
  i.priority,
  i.status,
  c.id as customer_id,
  c.name as customer_name,
  c.phone as customer_phone,
  c.company as customer_company,
  p.id as product_id,
  p.sku,
  p.name as product_name,
  p.stock_quantity,
  p.minimum_stock,
  i.quantity_requested,
  i.assigned_to
from interests i
join customers c on c.id = i.customer_id
join products p on p.id = i.product_id
where
  i.status not in ('won', 'lost', 'cancelled')
  and i.follow_up_date is not null
order by
  i.follow_up_date asc,
  i.priority desc;

-- =========================================================
-- WAITING STOCK VIEW
-- =========================================================

create or replace view waiting_stock_customers as
select
  i.id as interest_id,
  c.id as customer_id,
  c.name as customer_name,
  c.phone as customer_phone,
  c.company as customer_company,
  p.id as product_id,
  p.sku,
  p.name as product_name,
  p.stock_quantity,
  i.quantity_requested,
  i.priority,
  i.follow_up_date,
  i.created_at
from interests i
join customers c on c.id = i.customer_id
join products p on p.id = i.product_id
where
  i.status = 'waiting_stock'
order by
  i.priority desc,
  i.created_at asc;

-- =========================================================
-- LOW STOCK VIEW
-- =========================================================

create or replace view low_stock_products as
select
  id,
  sku,
  name,
  category,
  brand,
  model,
  stock_quantity,
  minimum_stock,
  location
from products
where
  is_active = true
  and stock_quantity < minimum_stock
order by
  stock_quantity asc;

-- =========================================================
-- STOCK UPDATE FUNCTION
-- Safer centralized stock update
-- =========================================================

create or replace function update_product_stock(
  p_product_id uuid,
  p_movement_type stock_movement_type,
  p_quantity integer,
  p_reason text default null,
  p_reference_code text default null
)
returns void as $$
declare
  v_previous_quantity integer;
  v_new_quantity integer;
begin
  if p_quantity <= 0 then
    raise exception 'Quantity must be greater than zero';
  end if;

  select stock_quantity
  into v_previous_quantity
  from products
  where id = p_product_id
  for update;

  if v_previous_quantity is null then
    raise exception 'Product not found';
  end if;

  if p_movement_type in ('incoming', 'released') then
    v_new_quantity := v_previous_quantity + p_quantity;
  elsif p_movement_type in ('outgoing', 'reserved') then
    v_new_quantity := v_previous_quantity - p_quantity;
  elsif p_movement_type = 'adjustment' then
    v_new_quantity := p_quantity;
  else
    raise exception 'Invalid movement type';
  end if;

  if v_new_quantity < 0 then
    raise exception 'Stock cannot be negative';
  end if;

  update products
  set stock_quantity = v_new_quantity
  where id = p_product_id;

  insert into stock_movements (
    product_id,
    movement_type,
    quantity,
    previous_quantity,
    new_quantity,
    reason,
    reference_code,
    created_by
  )
  values (
    p_product_id,
    p_movement_type,
    p_quantity,
    v_previous_quantity,
    v_new_quantity,
    p_reason,
    p_reference_code,
    auth.uid()
  );
end;
$$ language plpgsql security definer;

-- =========================================================
-- ROW LEVEL SECURITY
-- =========================================================

alter table profiles enable row level security;
alter table products enable row level security;
alter table customers enable row level security;
alter table interests enable row level security;
alter table notes enable row level security;
alter table stock_movements enable row level security;

-- Profiles
drop policy if exists "profiles_select_authenticated" on profiles;
create policy "profiles_select_authenticated"
on profiles for select
to authenticated
using (true);

drop policy if exists "profiles_update_self" on profiles;
create policy "profiles_update_self"
on profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- Products
drop policy if exists "products_all_authenticated" on products;
create policy "products_all_authenticated"
on products for all
to authenticated
using (true)
with check (true);

-- Customers
drop policy if exists "customers_all_authenticated" on customers;
create policy "customers_all_authenticated"
on customers for all
to authenticated
using (true)
with check (true);

-- Interests
drop policy if exists "interests_all_authenticated" on interests;
create policy "interests_all_authenticated"
on interests for all
to authenticated
using (true)
with check (true);

-- Notes
drop policy if exists "notes_all_authenticated" on notes;
create policy "notes_all_authenticated"
on notes for all
to authenticated
using (true)
with check (true);

-- Stock movements
drop policy if exists "stock_movements_select_authenticated" on stock_movements;
create policy "stock_movements_select_authenticated"
on stock_movements for select
to authenticated
using (true);

drop policy if exists "stock_movements_insert_authenticated" on stock_movements;
create policy "stock_movements_insert_authenticated"
on stock_movements for insert
to authenticated
with check (true);

-- =========================================================
-- BASIC DATA GUARDS
-- =========================================================

-- Prevent duplicate active customer phone when phone exists
create unique index if not exists idx_customers_unique_active_phone
on customers(phone)
where phone is not null and is_active = true;

-- Prevent duplicate customer-product active interest
create unique index if not exists idx_interests_unique_open_customer_product
on interests(customer_id, product_id)
where status in ('new', 'waiting_stock', 'contacted', 'quoted');

-- =========================================================
-- END OF FILE
-- =========================================================