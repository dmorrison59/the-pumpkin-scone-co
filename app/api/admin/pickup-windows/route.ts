import { NextResponse } from "next/server";
import { listPickupWindows, savePickupWindow, windowsConfigured } from "../../../lib/pickup-windows-store";

export const runtime = "nodejs";
export async function GET() {
  if (!windowsConfigured()) return NextResponse.json({ configured: false, windows: [] });
  try { return NextResponse.json({ configured: true, windows: await listPickupWindows() }); }
  catch { return NextResponse.json({ error: "Unable to load pickup windows" }, { status: 502 }); }
}

export async function POST(request: Request) {
  // This route is protected by existing /api/admin Basic Auth proxy.
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }
  if (!windowsConfigured()) return NextResponse.json({ error: "Pickup database not configured" }, { status: 503 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const validDate = /^\d{4}-\d{2}-\d{2}$/;
  const validTime = /^([01]\d|2[0-3]):[0-5]\d(:00)?$/;
  if (typeof body.label !== "string" || body.label.trim().length < 2 || body.label.length > 90 ||
    typeof body.address !== "string" || body.address.trim().length < 6 || body.address.length > 300 ||
    typeof body.pickup_date !== "string" || !validDate.test(body.pickup_date) ||
    typeof body.start_time !== "string" || !validTime.test(body.start_time) ||
    typeof body.end_time !== "string" || !validTime.test(body.end_time) ||
    body.end_time <= body.start_time ||
    typeof body.cutoff_at !== "string" || !Number.isFinite(Date.parse(body.cutoff_at)) ||
    !Number.isInteger(body.max_orders) || (body.max_orders as number) < 1 || (body.max_orders as number) > 1000 ||
    typeof body.is_open !== "boolean" ||
    (body.id !== undefined && (typeof body.id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.id)))) {
    return NextResponse.json({ error: "Invalid pickup window fields" }, { status: 400 });
  }
  try {
    const saved = await savePickupWindow({
      id: body.id as string | undefined,
      label: body.label.trim(), address: body.address.trim(),
      pickup_date: body.pickup_date, start_time: body.start_time, end_time: body.end_time,
      cutoff_at: body.cutoff_at, max_orders: body.max_orders as number, is_open: body.is_open,
    });
    return NextResponse.json({ window: saved });
  } catch { return NextResponse.json({ error: "Unable to save pickup window; check capacity and existing orders" }, { status: 502 }); }
}
