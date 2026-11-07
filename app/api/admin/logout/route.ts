import { NextResponse } from "next/server";
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set("pumpkin_admin_access", "", { maxAge: 0, path: "/admin" });
  response.cookies.set("pumpkin_admin_api", "", { maxAge: 0, path: "/api/admin" });
  return response;
}
