-- Atomic reservation functions, intended for a dedicated Pumpkin Scone Co. database.
-- Run pickup_windows.sql before this migration.
-- All functions are service-role-only and execute with a fixed search_path.
-- Reservations with an associated Checkout Session must be reconciled against Stripe.
-- Do not automatically expire attached sessions based only on local TTL.

create or replace function public.reserve_pickup_window(p_window_id uuid)
returns table(
  reservation_token uuid, pickup_label text, pickup_address text,
  pickup_date date, pickup_window text, expires_at timestamptz
)
language plpgsql security definer set search_path = public
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
    update public.pickup_reservations
    set status = 'released'
    where window_id = p_window_id and status = 'reserved'
      and checkout_session_id is null and expires_at < now()
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
language plpgsql security definer set search_path = public
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
language plpgsql security definer set search_path = public
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
language plpgsql security definer set search_path = public
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

revoke all on function public.reserve_pickup_window(uuid) from public,anon,authenticated;
revoke all on function public.attach_pickup_checkout(uuid,text) from public,anon,authenticated;
revoke all on function public.confirm_paid_pickup(text) from public,anon,authenticated;
revoke all on function public.release_pickup(uuid,text) from public,anon,authenticated;
grant execute on function public.reserve_pickup_window(uuid) to service_role;
grant execute on function public.attach_pickup_checkout(uuid,text) to service_role;
grant execute on function public.confirm_paid_pickup(text) to service_role;
grant execute on function public.release_pickup(uuid,text) to service_role;
