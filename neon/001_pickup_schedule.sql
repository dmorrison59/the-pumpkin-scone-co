BEGIN;
-- Neon PostgreSQL schema for Pumpkin Scone Co.; apply to Preview branch only.
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
REVOKE ALL ON public.pickup_windows FROM PUBLIC;
REVOKE ALL ON public.pickup_reservations FROM PUBLIC;
-- Use server-only PostgreSQL credentials. Do not expose DATABASE_URL to browsers.
-- Atomic capacity rules are defined by the functions below.

-- Atomic reservation functions for Neon PostgreSQL.
-- Requires tables above. All functions execute as the connected Neon database owner.
-- Attached checkout sessions are released only after Stripe's expiration is verified.

create or replace function public.reserve_pickup_window(p_window_id uuid)
returns table(
  reservation_token uuid, pickup_label text, pickup_address text,
  pickup_date date, pickup_window text, expires_at timestamptz
)
language plpgsql security invoker set search_path = public
as $$
declare
  w public.pickup_windows%rowtype;
  reservation public.pickup_reservations%rowtype;
  display_window text;
  expired_count integer;
begin
  select * into w from public.pickup_windows where id = p_window_id for update;
  if not found then raise exception 'Pickup window not found'; end if;

  -- Clean up unlinked holds only. Attached Stripe sessions require explicit reconciliation.
  with expired as (
    update public.pickup_reservations AS pr
    set status = 'released'
    where pr.window_id = p_window_id and pr.status = 'reserved'
      and pr.checkout_session_id is null and pr.expires_at < now()
    returning id
  )
  select count(*) into expired_count from expired;

  if expired_count > 0 then
    update public.pickup_windows
      set reserved_orders = reserved_orders - expired_count
      where id = p_window_id
    returning * into w;
  end if;

  if not w.is_open or w.cutoff_at <= now() or w.pickup_date < (now() at time zone 'America/New_York')::date then
    raise exception 'This pickup window is closed';
  end if;
  if w.reserved_orders + w.confirmed_orders >= w.max_orders then
    raise exception 'This pickup window is full';
  end if;
  display_window := to_char(w.start_time, 'FMHH12:MI AM') || '–' || to_char(w.end_time, 'FMHH12:MI AM');
  insert into public.pickup_reservations(window_id,pickup_label,pickup_address,pickup_date,pickup_window)
  values(w.id,w.label,w.address,w.pickup_date,display_window) returning * into reservation;
  update public.pickup_windows set reserved_orders = reserved_orders + 1 where id = w.id;
  return query select reservation.reservation_token,reservation.pickup_label,reservation.pickup_address,
    reservation.pickup_date,reservation.pickup_window,reservation.expires_at;
end $$;

create or replace function public.attach_pickup_checkout(p_token uuid, p_session_id text)
returns boolean
language plpgsql security invoker set search_path = public
as $$
declare
  current_reservation public.pickup_reservations%rowtype;
begin
  select * into current_reservation from public.pickup_reservations
    where reservation_token = p_token for update;
  if not found or current_reservation.status <> 'reserved' or current_reservation.expires_at < now()
     or current_reservation.checkout_session_id is not null then
    return false;
  end if;
  update public.pickup_reservations set checkout_session_id = p_session_id
    where id = current_reservation.id;
  return true;
end $$;

create or replace function public.confirm_paid_pickup(p_session_id text)
returns boolean
language plpgsql security invoker set search_path = public
as $$
declare
  w_id uuid;
  r public.pickup_reservations%rowtype;
begin
  select window_id into w_id from public.pickup_reservations where checkout_session_id = p_session_id;
  if not found then return false; end if;
  perform 1 from public.pickup_windows where id = w_id for update;
  select * into r from public.pickup_reservations
    where checkout_session_id = p_session_id for update;
  if r.status = 'paid' then return true; end if;
  if r.status <> 'reserved' then return false; end if;
  update public.pickup_reservations set status = 'paid' where id = r.id;
  update public.pickup_windows set reserved_orders = reserved_orders - 1,
    confirmed_orders = confirmed_orders + 1 where id = r.window_id;
  return true;
end $$;

create or replace function public.release_pickup(p_token uuid default null, p_session_id text default null)
returns boolean
language plpgsql security invoker set search_path = public
as $$
declare
  w_id uuid;
  r public.pickup_reservations%rowtype;
begin
  if (p_token is null) = (p_session_id is null) then
    raise exception 'Supply exactly one reservation identifier';
  end if;
  if p_token is not null then
    select window_id into w_id from public.pickup_reservations where reservation_token = p_token;
  else
    select window_id into w_id from public.pickup_reservations where checkout_session_id = p_session_id;
  end if;
  if not found then return false; end if;
  perform 1 from public.pickup_windows where id = w_id for update;
  if p_token is not null then
    select * into r from public.pickup_reservations where reservation_token = p_token for update;
  else
    select * into r from public.pickup_reservations where checkout_session_id = p_session_id for update;
  end if;
  if r.status = 'released' then return true; end if;
  if r.status = 'paid' then return false; end if;
  update public.pickup_reservations set status = 'released' where id = r.id;
  update public.pickup_windows set reserved_orders = reserved_orders - 1 where id = r.window_id;
  return true;
end $$;

REVOKE ALL ON FUNCTION public.reserve_pickup_window(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.attach_pickup_checkout(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_paid_pickup(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_pickup(uuid,text) FROM PUBLIC;

COMMIT;
