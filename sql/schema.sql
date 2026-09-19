-- ============================================================
-- SANGWA STUDIO — Supabase schema
-- Run this once in your Supabase project's SQL Editor
-- (Dashboard → SQL Editor → New query → paste → Run)
-- ============================================================

create extension if not exists "pgcrypto";

-- Booking / order requests from the "Book your session" form
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  division text not null check (division in ('photo','video','music')),
  service_type text not null,
  full_name text not null,
  phone text not null,
  email text,
  event_date date,
  budget text,
  details text,
  status text not null default 'new' check (status in ('new','contacted','confirmed','completed','cancelled'))
);

-- General contact messages (optional, if you add a separate contact form later)
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  full_name text not null,
  email text,
  subject text,
  message text not null
);

-- ------------------------------------------------------------
-- Row Level Security
-- ------------------------------------------------------------
-- The public anon key can INSERT (submit a booking) but cannot
-- read, update, or delete anything. You'll read bookings from
-- the Supabase Table Editor (logged in as the project owner)
-- or by using the service_role key in a private admin tool.
-- ------------------------------------------------------------

alter table public.orders enable row level security;
alter table public.messages enable row level security;

drop policy if exists "Public can submit orders" on public.orders;
create policy "Public can submit orders"
  on public.orders for insert
  to anon
  with check (true);

drop policy if exists "Public can submit messages" on public.messages;
create policy "Public can submit messages"
  on public.messages for insert
  to anon
  with check (true);

-- No SELECT/UPDATE/DELETE policies are created for the anon role,
-- so the public form cannot read back existing bookings.

-- ------------------------------------------------------------
-- Optional: index for sorting the studio's dashboard by newest first
-- ------------------------------------------------------------
create index if not exists orders_created_at_idx on public.orders (created_at desc);
create index if not exists messages_created_at_idx on public.messages (created_at desc);
