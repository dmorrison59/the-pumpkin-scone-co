import "server-only";

export type PickupWindow = {
  id: string;
  label: string;
  address: string;
  pickup_date: string;
  start_time: string;
  end_time: string;
  cutoff_at: string;
  max_orders: number;
  reserved_orders: number;
  confirmed_orders: number;
  is_open: boolean;
};

const base = () => process.env.PICKUP_SUPABASE_URL?.replace(/\/$/, "");
const key = () => process.env.PICKUP_SUPABASE_SERVICE_ROLE_KEY;
export function windowsConfigured() { return Boolean(base() && key()); }

async function request(path: string, init: RequestInit = {}) {
  if (!windowsConfigured()) throw new Error("Pickup database is not configured");
  const response = await fetch(`${base()}/rest/v1/${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      apikey: key()!,
      Authorization: `Bearer ${key()}`,
      ...(init.headers || {}),
    },
  });
  if (!response.ok) throw new Error(`Pickup database error: ${response.status}`);
  return response;
}

export async function listPickupWindows(): Promise<PickupWindow[]> {
  if (!windowsConfigured()) return [];
  const response = await request("pickup_windows?select=*&order=pickup_date.asc,start_time.asc&limit=200");
  return response.json();
}

export function publicWindow(window: PickupWindow) {
  const cutoff = new Date(window.cutoff_at).getTime();
  // Date comparison uses America/New_York; cutoff is an absolute timestamp.
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  return window.is_open && window.pickup_date >= day &&
    Number.isFinite(cutoff) && cutoff > Date.now() &&
    window.confirmed_orders + window.reserved_orders < window.max_orders;
}

export async function savePickupWindow(input: Partial<PickupWindow> & { id?: string }) {
  const fields = ["label","address","pickup_date","start_time","end_time","cutoff_at","max_orders","is_open"] as const;
  const record: Record<string, unknown> = {};
  for (const field of fields) if (input[field] !== undefined) record[field] = input[field];
  const updating = Boolean(input.id);
  const path = updating ? `pickup_windows?id=eq.${encodeURIComponent(input.id!)}` : "pickup_windows";
  const response = await request(path, {
    method: updating ? "PATCH" : "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(record),
  });
  const result = await response.json();
  if (result.length !== 1) throw new Error("Pickup window was not saved");
  return result[0] as PickupWindow;
}

export type PickupReservation = {
  reservation_token: string; pickup_label: string; pickup_address: string;
  pickup_date: string; pickup_window: string; expires_at: string;
};

async function rpc(name: string, body: Record<string, unknown>): Promise<unknown> {
  const response = await request(`rpc/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return response.json();
}

export async function reservePickupWindow(id: string): Promise<PickupReservation> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Invalid pickup window");
  const result = await rpc("reserve_pickup_window", { p_window_id: id });
  if (!Array.isArray(result) || result.length !== 1 || typeof result[0].reservation_token !== "string") {
    throw new Error("No pickup reservations available");
  }
  return result[0] as PickupReservation;
}

export async function attachPickupCheckout(token: string, sessionId: string): Promise<boolean> {
  return (await rpc("attach_pickup_checkout", { p_token: token, p_session_id: sessionId })) === true;
}

export async function confirmPaidPickup(sessionId: string): Promise<boolean> {
  return (await rpc("confirm_paid_pickup", { p_session_id: sessionId })) === true;
}

export async function releasePickup(input: { token?: string; sessionId?: string }): Promise<boolean> {
  return (await rpc("release_pickup", {
    p_token: input.token ?? null,
    p_session_id: input.sessionId ?? null,
  })) === true;
}
