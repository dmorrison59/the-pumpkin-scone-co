import { NextResponse } from "next/server";
import { dbRequest, databaseConfigured } from "../../../lib/admin-server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!databaseConfigured()) return NextResponse.json({ error: "Admin setup is incomplete" }, { status: 503 });
  const origin = request.headers.get("origin");
  const expected = new URL(request.url).origin;
  if (origin !== expected) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });

  let body: { email?: unknown; password?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (email !== "dmorrison1004@gmail.com" || !password || password.length > 1024) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const base = process.env.SUPABASE_URL!.replace(/\/$/, "");
  const anon = process.env.SUPABASE_ANON_KEY!;
  const auth = await fetch(`${base}/auth/v1/token?grant_type=password`, {
    method: "POST", cache: "no-store",
    headers: { apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!auth.ok) return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  const session = await auth.json();
  if (typeof session.access_token !== "string" || session.user?.email?.toLowerCase() !== email) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }
  const role = await dbRequest(`admin_users?user_id=eq.${encodeURIComponent(session.user.id)}&select=user_id&limit=1`);
  if (!role.ok || (await role.json()).length !== 1) {
    return NextResponse.json({ error: "Not authorized as administrator" }, { status: 403 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set("pumpkin_admin_access", session.access_token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict",
    path: "/admin", maxAge: Math.min(session.expires_in || 3600, 3600),
  });
  // The API requires its own cookie path.
  response.cookies.set("pumpkin_admin_api", session.access_token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict",
    path: "/api/admin", maxAge: Math.min(session.expires_in || 3600, 3600),
  });
  return response;
}
