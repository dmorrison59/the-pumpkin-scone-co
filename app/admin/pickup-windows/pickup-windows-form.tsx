"use client";
import { FormEvent, useState } from "react";
import type { CSSProperties } from "react";
import type { PickupWindow } from "../../lib/pickup-windows-store";

function easternLocalInput(value: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(value));
  const p = Object.fromEntries(parts.filter(x => x.type !== "literal").map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

const blank = { id: "", label: "", address: "", pickup_date: "", start_time: "09:00", end_time: "12:00", cutoff_at: "", max_orders: 20, is_open: false };
export default function PickupWindowsForm({ initialWindows, enabled }: { initialWindows: PickupWindow[]; enabled: boolean }) {
  const [form, setForm] = useState(blank);
  const [windows, setWindows] = useState(initialWindows);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  function edit(w: PickupWindow) {
    setForm({ id: w.id, label: w.label, address: w.address, pickup_date: w.pickup_date,
      start_time: w.start_time.slice(0,5), end_time: w.end_time.slice(0,5),
      cutoff_at: easternLocalInput(w.cutoff_at), max_orders: w.max_orders, is_open: w.is_open });
  }
  async function save(e: FormEvent) {
    e.preventDefault(); setSaving(true); setMessage("");
    try {
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(form.cutoff_at)) throw new Error("Choose a valid order deadline");
      const response = await fetch("/api/admin/pickup-windows", { method: "POST", headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ ...form, id: form.id || undefined, cutoff_at: form.cutoff_at }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to save");
      setWindows(old => [...old.filter(w => w.id !== result.window.id), result.window].sort((a,b)=>a.pickup_date.localeCompare(b.pickup_date)));
      setForm(blank);
      setMessage("Pickup window saved in the Preview database. Customer checkout is controlled by the scheduling feature switch.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to save"); }
    finally { setSaving(false); }
  }
  const input: CSSProperties = {width:"100%",padding:10,border:"1px solid #d6c3b2",borderRadius:6,boxSizing:"border-box" as const};
  const label: CSSProperties = {display:"grid",gap:6,marginBottom:13};
  return <div>
    <h2>Scheduled pickup windows</h2>
    {windows.length===0 ? <p>No pickup windows created yet.</p> : windows.map(w=><div key={w.id} style={{padding:14,marginBottom:10,border:"1px solid #e1cdbb",borderRadius:9}}>
      <strong>{w.label} — {w.pickup_date}</strong><br/>{w.address}<br/>
      {w.start_time.slice(0,5)}–{w.end_time.slice(0,5)} · {w.is_open?"Published":"Closed"} · {w.confirmed_orders} confirmed
      <div><button type="button" onClick={()=>edit(w)}>Edit</button></div>
    </div>)}
    <h2>{form.id?"Edit pickup window":"Create pickup window"}</h2>
    <form onSubmit={save} style={{maxWidth:540}}>
      <label style={label}>Location name<input required minLength={2} maxLength={90} style={input} value={form.label} onChange={e=>setForm({...form,label:e.target.value})} placeholder="Downtown pickup"/></label>
      <label style={label}>Full address or pickup instructions<textarea required minLength={6} maxLength={300} style={input} value={form.address} onChange={e=>setForm({...form,address:e.target.value})}/></label>
      <label style={label}>Pickup date<input required type="date" style={input} value={form.pickup_date} onChange={e=>setForm({...form,pickup_date:e.target.value})}/></label>
      <label style={label}>Window starts<input required type="time" style={input} value={form.start_time} onChange={e=>setForm({...form,start_time:e.target.value})}/></label>
      <label style={label}>Window ends<input required type="time" style={input} value={form.end_time} onChange={e=>setForm({...form,end_time:e.target.value})}/></label>
      <label style={label}>Order cutoff (Eastern local time)<input required type="datetime-local" style={input} value={form.cutoff_at} onChange={e=>setForm({...form,cutoff_at:e.target.value})}/></label>
      <label style={label}>Maximum orders<input required type="number" min={1} max={1000} style={input} value={form.max_orders} onChange={e=>setForm({...form,max_orders:Number(e.target.value)})}/></label>
      <label style={{...label,display:"flex",alignItems:"center"}}><input type="checkbox" checked={form.is_open} onChange={e=>setForm({...form,is_open:e.target.checked})}/> Publish this window</label>
      <button disabled={!enabled||saving} type="submit" style={{padding:"12px 18px",background:"#553423",color:"white",border:0,borderRadius:7}}>{saving?"Saving...":"Save pickup window"}</button>
      {form.id && <button type="button" onClick={()=>setForm(blank)}>Cancel edit</button>}
      {message && <p role="status">{message}</p>}
    </form>
  </div>;
}
