import "server-only";
import { neon } from "@neondatabase/serverless";

export type PickupWindow = {
  id: string; label: string; address: string; pickup_date: string;
  start_time: string; end_time: string; cutoff_at: string;
  max_orders: number; reserved_orders: number; confirmed_orders: number; is_open: boolean;
};
export type PickupReservation = {
  reservation_token: string; pickup_label: string; pickup_address: string;
  pickup_date: string; pickup_window: string; expires_at: string;
};

export function windowsConfigured() {
  return Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL);
}
function db() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error("Neon PostgreSQL is not configured");
  return neon(url);
}

// Neon HTTP driver does not permit query identifiers to be dynamically interpolated.
// Keep SQL statements static and use parameter placeholders via tagged templates.
export async function listPickupWindows(): Promise<PickupWindow[]> {
  if (!windowsConfigured()) return [];
  const sql = db();
  const rows = await sql`SELECT id, label, address, pickup_date::text AS pickup_date,
    to_char(start_time, 'HH24:MI') AS start_time,
    to_char(end_time, 'HH24:MI') AS end_time,
    cutoff_at::text AS cutoff_at, max_orders, reserved_orders, confirmed_orders, is_open
    FROM public.pickup_windows ORDER BY pickup_date, start_time LIMIT 200`;
  return rows as PickupWindow[];
}

export function publicWindow(window: PickupWindow) {
  const cutoff = new Date(window.cutoff_at).getTime();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const dates = Object.fromEntries(parts.filter(p => p.type !== "literal").map(p => [p.type, p.value]));
  const day = `${dates.year}-${dates.month}-${dates.day}`;
  return window.is_open && window.pickup_date >= day && Number.isFinite(cutoff) &&
    cutoff > Date.now() && window.confirmed_orders + window.reserved_orders < window.max_orders;
}

export async function savePickupWindow(input: Partial<PickupWindow> & { id?: string }): Promise<PickupWindow> {
  const sql = db();
  const label = input.label!, address = input.address!, pickupDate = input.pickup_date!;
  const startTime = input.start_time!, endTime = input.end_time!, cutoff = input.cutoff_at!;
  const maxOrders = input.max_orders!, isOpen = input.is_open!;
  const rows = input.id ? await sql`
    UPDATE public.pickup_windows SET label=${label}, address=${address}, pickup_date=${pickupDate}::date,
      start_time=${startTime}::time, end_time=${endTime}::time, cutoff_at=(${cutoff}::timestamp AT TIME ZONE 'America/New_York'),
      max_orders=${maxOrders}, is_open=${isOpen}
    WHERE id=${input.id}::uuid AND (
      reserved_orders + confirmed_orders = 0 OR (
        label IS NOT DISTINCT FROM ${label}
        AND address IS NOT DISTINCT FROM ${address}
        AND pickup_date IS NOT DISTINCT FROM ${pickupDate}::date
        AND start_time IS NOT DISTINCT FROM ${startTime}::time
        AND end_time IS NOT DISTINCT FROM ${endTime}::time
        AND cutoff_at IS NOT DISTINCT FROM (${cutoff}::timestamp AT TIME ZONE 'America/New_York')
      )
    )
    RETURNING id, label, address, pickup_date::text AS pickup_date,
      to_char(start_time, 'HH24:MI') AS start_time, to_char(end_time, 'HH24:MI') AS end_time,
      cutoff_at::text AS cutoff_at, max_orders, reserved_orders, confirmed_orders, is_open
  ` : await sql`
    INSERT INTO public.pickup_windows(label,address,pickup_date,start_time,end_time,cutoff_at,max_orders,is_open)
    VALUES (${label},${address},${pickupDate}::date,${startTime}::time,${endTime}::time,
      (${cutoff}::timestamp AT TIME ZONE 'America/New_York'),${maxOrders},${isOpen})
    RETURNING id, label, address, pickup_date::text AS pickup_date,
      to_char(start_time, 'HH24:MI') AS start_time, to_char(end_time, 'HH24:MI') AS end_time,
      cutoff_at::text AS cutoff_at, max_orders, reserved_orders, confirmed_orders, is_open
  `;
  if (rows.length !== 1) throw new Error("Cannot modify a booked pickup window. You may close it or change its capacity.");
  return rows[0] as PickupWindow;
}

export async function reservePickupWindow(id: string): Promise<PickupReservation> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Invalid pickup window");
  const sql = db();
  const rows = await sql`SELECT reservation_token::text, pickup_label, pickup_address,
    pickup_date::text, pickup_window, expires_at::text
    FROM public.reserve_pickup_window(${id}::uuid)`;
  if (rows.length !== 1) throw new Error("Pickup window has no availability");
  return rows[0] as PickupReservation;
}
export async function attachPickupCheckout(token: string, sessionId: string): Promise<boolean> {
  const sql = db();
  const rows = await sql`SELECT public.attach_pickup_checkout(${token}::uuid,${sessionId}) AS ok`;
  return rows[0]?.ok === true;
}
export async function confirmPaidPickup(sessionId: string): Promise<boolean> {
  const sql = db();
  const rows = await sql`SELECT public.confirm_paid_pickup(${sessionId}) AS ok`;
  return rows[0]?.ok === true;
}
export async function releasePickup(input: { token?: string; sessionId?: string }): Promise<boolean> {
  if (Boolean(input.token) === Boolean(input.sessionId)) throw new Error("Supply one reservation identifier");
  const sql = db();
  const rows = await sql`SELECT public.release_pickup(${input.token ?? null}::uuid,${input.sessionId ?? null}) AS ok`;
  return rows[0]?.ok === true;
}
