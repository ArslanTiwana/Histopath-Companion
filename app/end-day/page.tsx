"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppNav from "@/app/components/AppNav";
import DictationButton from "@/app/components/DictationButton";

type Summary = { done: number; revisit: number; learned: number; reminders: { id: number; text: string; dueAt: string; case: { caseLabel: string } | null }[]; carry: { id: number; caseLabel: string; status: string }[] };

export default function EndDayPage() {
  const [data, setData] = useState<Summary | null>(null); const [text, setText] = useState(""); const [when, setWhen] = useState("tomorrow"); const [review, setReview] = useState(false); const [message, setMessage] = useState("");
  async function load() { setData(await (await fetch("/api/end-day")).json()); }
  useEffect(() => { void load(); }, []);
  async function addReminder() { const response = await fetch("/api/reminders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, when, confirmed: true }) }); const result = await response.json(); if (!response.ok) return setMessage(result.error || "Could not save reminder"); setText(""); setMessage("Reminder saved"); await load(); }
  async function closeDay() { const response = await fetch("/api/end-day", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmed: true }) }); if (response.ok) { localStorage.setItem("histopath_day_closed", new Date().toISOString().slice(0, 10)); setMessage("Day closed. Tomorrow's briefing is ready."); setReview(false); } }
  function voice(value: string) { if (/close day/i.test(value)) return setReview(true); const reminder = value.match(/remind me\s+(.+)/i); if (reminder) { setWhen(reminder[1]); setText("Follow up"); } }
  if (!data) return <main className="app-shell">Loading summary…</main>;
  return <main className="app-shell"><Link href="/" className="back">← Worklist</Link><div className="eyebrow">{new Date().toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}</div><h1>End of day</h1><div className="day-counts"><div><strong>{data.done}</strong><span>Done</span></div><div><strong>{data.revisit}</strong><span>Revisit</span></div><div><strong>{data.learned}</strong><span>Learned</span></div></div><section className="detail-card form-stack"><h3>Add reminder</h3><input value={text} onChange={(event) => setText(event.target.value)} placeholder="Colon IHC" /><input value={when} onChange={(event) => setWhen(event.target.value)} placeholder="Thursday or 2026-10-29" /><button className="secondary" disabled={!text.trim()} onClick={() => void addReminder()}>Review and save reminder</button></section><div className="end-list">{data.reminders.slice(0, 4).map((item) => <div className="summary-row" key={item.id}><span>✓</span><b>{item.case?.caseLabel || item.text}</b><strong>{new Date(item.dueAt).toLocaleDateString()}</strong></div>)}{data.carry.slice(0, 4).map((item) => <div className="summary-row" key={item.id}><span>→</span><b>{item.caseLabel}</b><strong>Carry</strong></div>)}</div><p className="form-note">Close the day to save the summary. Tomorrow starts with these reminders.</p>{review ? <section className="detail-card readback"><h2>Close today?</h2><p>{data.done} done, {data.revisit} reminders, and {data.carry.length} carried over.</p><div className="gross-actions"><button className="secondary" onClick={() => setReview(false)}>Cancel</button><button className="primary" onClick={() => void closeDay()}>Confirm close day</button></div></section> : <button className="primary wide" onClick={() => setReview(true)}>Close day</button>}<DictationButton label="Say remind me Thursday or close day" onTranscript={voice} />{message && <div className="notice">{message}</div>}<AppNav /></main>;
}
