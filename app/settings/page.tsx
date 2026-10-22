"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppNav from "@/app/components/AppNav";

type Settings = { overdueDays: number; ai: { provider: string; commandModel: string; chatModel: string; sttModel: string } };

export default function SettingsPage() {
  const [data, setData] = useState<Settings | null>(null); const [currentPin, setCurrentPin] = useState(""); const [newPin, setNewPin] = useState(""); const [message, setMessage] = useState("");
  useEffect(() => { fetch("/api/settings").then((r) => r.json()).then(setData); }, []);
  async function save(body: Record<string, unknown>) { setMessage(""); const response = await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, confirmed: true }) }); const result = await response.json(); setMessage(response.ok ? "Saved" : result.error || "Could not save"); }
  if (!data) return <main className="app-shell">Loading settings…</main>;
  return <main className="app-shell"><div className="eyebrow">PRIVATE APP SETTINGS</div><h1>Settings</h1><section className="detail-card form-stack"><h3>Worklist</h3><label className="field-label">Mark cases overdue after<input type="number" min="1" max="30" value={data.overdueDays} onChange={(event) => setData({ ...data, overdueDays: Number(event.target.value) })} /></label><button className="primary" onClick={() => void save({ action: "preferences", overdueDays: data.overdueDays })}>Confirm settings</button></section><section className="detail-card form-stack"><h3>Change PIN</h3><input inputMode="numeric" maxLength={4} value={currentPin} onChange={(event) => setCurrentPin(event.target.value.replace(/\D/g, ""))} placeholder="Current PIN" /><input inputMode="numeric" maxLength={4} value={newPin} onChange={(event) => setNewPin(event.target.value.replace(/\D/g, ""))} placeholder="New 4-digit PIN" /><button className="primary" disabled={currentPin.length !== 4 || newPin.length !== 4} onClick={() => void save({ action: "pin", currentPin, newPin })}>Confirm PIN change</button></section><section className="detail-card"><h3>AI configuration</h3><div className="settings-list"><span>Provider <b>{data.ai.provider}</b></span><span>Commands <b>{data.ai.commandModel}</b></span><span>Chat <b>{data.ai.chatModel}</b></span><span>Speech <b>{data.ai.sttModel}</b></span></div><p className="subtle">Model credentials remain server-side environment variables.</p></section><div className="settings-links"><Link href="/settings/templates">Manage templates <span>›</span></Link><a href="/api/export" download>Export all case data <span>↓</span></a><Link href="/end-day">End-of-day summary <span>›</span></Link></div>{message && <div className="notice">{message}</div>}<AppNav active="settings" /></main>;
}
