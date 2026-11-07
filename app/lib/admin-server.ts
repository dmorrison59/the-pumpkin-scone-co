import "server-only";
import { cookies } from "next/headers";

const url = () => process.env.SUPABASE_URL?.replace(/\/$/, "");
const serviceKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY;

export type Order = {
  session_id: string; customer_name: string; customer_email: string; customer_phone: string;
  pack_size: number; box_quantity: number; total_scones: number; amount_cents: number;
  pickup_date: string; pickup_window: string; status: "new" | "baking" | "ready" | "picked_up";
  created_at: string;
};

export function databaseConfigured() {
  return Boolean(url() && serviceKey() && process.env.SUPABASE_ANON_KEY);
}

export async function dbRequest(path: string, init: RequestInit = {}) {
  if (!url() || !serviceKey()) throw new Error("Database not configured");
  return fetch(`${url()}/rest/v1/${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      apikey: serviceKey()!,
      Authorization: `Bearer ${serviceKey()}`,
      ...(init.headers || {}),
    },
  });
}

async function supabaseUser(accessToken: string): Promise<{ id: string; email?: string } | null> {
  const base = url();
  const anon = process.env.SUPABASE_ANON_KEY;
  if (!base || !anon) return null;
  const response = await fetch(`${base}/auth/v1/user`, {
    cache: "no-store",
    headers: { apikey: anon, Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return null;
  const user = await response.json();
  return typeof user.id === "string" ? user : null;
}

export async function getAdmin() {
  if (!databaseConfigured()) return null;
  const store = await cookies();
  const token = store.get("pumpkin_admin_access")?.value;
  if (!token) return null;
  const user = await supabaseUser(token);
  if (!user || user.email?.toLowerCase() !== "dmorrison1004@gmail.com") return null;
  const response = await dbRequest(`admin_users?user_id=eq.${encodeURIComponent(user.id)}&select=user_id&limit=1`);
  if (!response.ok) return null;
  const rows = await response.json();
  return rows.length === 1 ? user : null;
}
