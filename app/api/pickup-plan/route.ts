import { NextResponse } from "next/server";
import { getPickupPlan } from "../../lib/pickup";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getPickupPlan());
}
