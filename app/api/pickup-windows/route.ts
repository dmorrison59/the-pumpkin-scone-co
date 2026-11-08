import { NextResponse } from "next/server";
import { listPickupWindows, publicWindow } from "../../lib/pickup-windows-store";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const windows = (await listPickupWindows()).filter(publicWindow).map(
      ({ id, label, address, pickup_date, start_time, end_time, cutoff_at, max_orders, reserved_orders, confirmed_orders }) => ({
        id, label, address, pickup_date, start_time, end_time, cutoff_at,
        remaining: max_orders - reserved_orders - confirmed_orders,
      })
    );
    return NextResponse.json({ windows }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    // Fail closed: an unavailable schedule never creates implied availability.
    return NextResponse.json({ windows: [], error: "Pickup schedule is temporarily unavailable" }, { status: 503 });
  }
}
