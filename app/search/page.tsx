"use client";

import Link from "next/link";
import { useState } from "react";
import AppNav from "@/app/components/AppNav";
import DictationButton from "@/app/components/DictationButton";
import { apiFetch } from "@/lib/api-fetch";

type Result = { id: number; caseLabel: string; specimenType: string | null; status: string; diagnosis: string | null };

export default function SearchPage() {
  const [query, setQuery] = useState(""); const [results, setResults] = useState<Result[]>([]); const [error, setError] = useState("");
  async function search(value = query) { setQuery(value); setError(""); try { setResults(await apiFetch<Result[]>("/api/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: value }) })); } catch (cause) { setError(cause instanceof Error ? cause.message : "Search failed"); } }
  function voice(text: string) { const open = text.match(/open the (first|second|third|fourth|fifth)/i); if (open && results.length) { const position = ["first", "second", "third", "fourth", "fifth"].indexOf(open[1].toLowerCase()); if (results[position]) window.location.href = `/cases/${results[position].id}`; return; } void search(text); }
  return <main className="app-shell"><Link href="/" className="back">← Worklist</Link><div className="eyebrow">BY VOICE OR TEXT</div><h1>Search</h1><form className="search-box" onSubmit={(event) => { event.preventDefault(); void search(); }}><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Last three breast cases with DCIS" /><button className="primary">Search</button></form>{query && <section className="spoken-card"><div><b>You searched</b><p>“{query}”</p></div></section>}<div className="case-list">{results.map((item) => <Link className="case-row" href={`/cases/${item.id}`} key={item.id}><div><strong>{item.caseLabel} · {item.specimenType || "Specimen"}</strong><span>{item.diagnosis || "No provisional diagnosis"}</span></div><span className="status-pill">{item.status.replaceAll("_", " ")}</span></Link>)}{query && !results.length && !error && <p className="empty">No matching cases.</p>}</div><p className="form-note">Tap a case or say “open the second one”.</p><DictationButton label="Search or open a result" onTranscript={voice} />{error && <div className="error">{error}</div>}<AppNav active="cases" /></main>;
}
