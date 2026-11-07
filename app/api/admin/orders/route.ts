import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { dbRequest, getAdmin } from "../../../lib/admin-server";

export const runtime = "nodejs";
export async function GET() {
  const store = await cookies();
  // The admin API cookie is scoped to /api/admin; getAdmin reads the page cookie
  // where available. For API calls, map the API token to the same verified session.
  const token = store.get("pumpkin_admin_api")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const response = await dbRequest("orders?select=*&order=created_at.desc&limit=200");
  if (!response.ok) return NextResponse.json({ error: "Unable to load orders" }, { status: 502 });
  return NextResponse.json({ orders: await response.json() }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request) {
  const origin = request.headers.get("origin");
  if (origin !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  if (!await getAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let data: { session_id?: unknown; status?: unknown };
  try { data = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  if (typeof data.session_id !== "string" || !/^cs_(test_)?[A-Za-z0-9]+$/.test(data.session_id) ||
    !["new", "baking", "ready", "picked_up"].includes(String(data.status))) {
    return NextResponse.json({ error: "Invalid status update" }, { status: 400 });
  }
  const result = await dbRequest(`orders?session_id=eq.${encodeURIComponent(data.session_id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({ status: data.status }),
  });
  if (!result.ok) return NextResponse.json({ error: "Update failed" }, { status: 502 });
  const changed = await result.json();
  return NextResponse.json({ order: changed[0] ?? null });
}
