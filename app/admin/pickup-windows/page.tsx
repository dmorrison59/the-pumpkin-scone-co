import Link from "next/link";
import { listPickupWindows, windowsConfigured } from "../../lib/pickup-windows-store";
import PickupWindowsForm from "./pickup-windows-form";
export const dynamic = "force-dynamic";
export const metadata = { title: "Pickup Schedule | Pumpkin Scone Admin", robots: { index: false } };
export default async function PickupSchedulePage() {
  const configured = windowsConfigured();
  let windows = [];
  let error = false;
  try { windows = await listPickupWindows(); } catch { error = true; }
  return <main style={{maxWidth:900,margin:"32px auto",padding:20,fontFamily:"Arial,sans-serif",color:"#3f2c24"}}>
    <Link href="/admin">← Back to order dashboard</Link>
    <h1 style={{fontFamily:"Georgia,serif"}}>Pickup Schedule</h1>
    <p>You choose the location, day, and shared pickup window. Customers cannot reserve individual appointments.</p>
    {!configured && <p role="alert">Setup required: the pickup database has not been connected yet. No windows can be published.</p>}
    {error && <p role="alert">The pickup schedule could not be loaded.</p>}
    <PickupWindowsForm initialWindows={windows} enabled={configured && !error}/>
  </main>;
}
