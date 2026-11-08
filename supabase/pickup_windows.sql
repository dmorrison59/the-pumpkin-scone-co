-- Run in a dedicated Pumpkin Scone Co. Supabase project.
-- Use the service-role key only on the server; never use NEXT_PUBLIC_ for it.
create extension if not exists pgcrypto;
create table if not exists public.pickup_windows (
  id uuid primary key default gen_random_uuid(),
  label text not null check (length(label) between 2 and 90),
  address text not null check (length(address) between 6 and 300),
  pickup_date date not null,
  start_time time not null,
  end_time time not null,
  cutoff_at timestamptz not null,
  max_orders integer not null check (max_orders between 1 and 1000),
  reserved_orders integer not null default 0 check (reserved_orders >= 0),
  confirmed_orders integer not null default 0 check (confirmed_orders >= 0),
  is_open boolean not null default false,
  created_at timestamptz not null default now(),
  constraint time_window_order check (end_time > start_time),
  constraint capacity_guard check (reserved_orders + confirmed_orders <= max_orders)
);
create table if not exists public.pickup_reservations (
  id uuid primary key default gen_random_uuid(),
  checkout_session_id text unique,
  reservation_token uuid not null unique default gen_random_uuid(),
  window_id uuid not null references public.pickup_windows(id),
  status text not null default 'reserved' check (status in ('reserved','paid','released')),
  expires_at timestamptz not null default (now() + interval '35 minutes'),
  created_at timestamptz not null default now(),
  pickup_label text not null,
  pickup_address text not null,
  pickup_date date not null,
  pickup_window text not null
);
create index if not exists pickup_window_status_idx on public.pickup_reservations(window_id,status);
alter table public.pickup_windows enable row level security;
alter table public.pickup_reservations enable row level security;
revoke all on public.pickup_windows from anon, authenticated;
revoke all on public.pickup_reservations from anon, authenticated;
-- No direct public table access: only server-side service role may read or modify.
-- A future transaction-backed checkout reservation RPC must enforce capacity under concurrency.
