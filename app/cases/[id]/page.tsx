"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import AppNav from "@/app/components/AppNav";
type Case = {
  id: number;
  caseLabel: string;
  specimenType: string | null;
  priority: string;
  status: string;
  incomplete: boolean;
  steps: { id: number; step: string; status: string; reason: string | null }[];
  events: { id: number; type: string; at: string; payload: unknown }[];
  grossEntry?: { descriptionText: string } | null;
  microEntry?: { dictation: string; provisionalDx: string | null } | null;
};
export default function CasePage({ params }: { params: { id: string } }) {
  const [c, setC] = useState<Case | null>(null);
  useEffect(() => {
    fetch(`/api/cases/${params.id}`)
      .then((r) => r.json())
      .then((item: Case) => setC(item));
  }, [params.id]);
  if (!c)
    return (
      <main className="app-shell">
        <p>Loading…</p>
      </main>
    );
  return (
    <main className="app-shell">
      <Link href="/" className="back">
        ← Worklist
      </Link>
      <header>
        <div>
          <div className="eyebrow">CASE DETAIL</div>
          <h1>{c.caseLabel}</h1>
          <p className="subtle">
            {c.specimenType || "Specimen not set"} · {c.priority}
          </p>
        </div>
        <span className="status-pill">{c.status.replaceAll("_", " ")}</span>
      </header>
      <section className="detail-card">
        <div className="section-title">
          <h2>Step progress</h2>
          {c.incomplete && <span className="incomplete">Incomplete</span>}
        </div>
        <div className="steps">
          {c.steps.map((s) => (
            <div className={`step ${s.status}`} key={s.id}>
              <span className="step-dot" />
              <div>
                <strong>{s.step}</strong>
                <span>
                  {s.status}
                  {s.reason ? ` · ${s.reason}` : ""}
                </span>
              </div>
            </div>
          ))}
        </div>
        {c.status === "gross_pending" ? (
          <Link className="primary" href={`/cases/${c.id}/gross`}>
            Start guided gross
          </Link>
        ) : c.status === "micro_pending" ? (
          <Link className="primary" href={`/cases/${c.id}/micro`}>
            Start microscopy
          </Link>
        ) : c.status === "with_consultant" ? (
          <Link className="primary" href={`/cases/${c.id}/consultant`}>
            Add consultant diagnosis
          </Link>
        ) : c.status === "consultant_dx_added" ? (
          <Link className="primary" href={`/cases/${c.id}/consultant`}>
            Review and generate report
          </Link>
        ) : c.status === "report_draft" ? (
          <Link className="primary" href={`/cases/${c.id}/report`}>
            Review report
          </Link>
        ) : c.status === "report_approved" ? (
          <Link className="primary" href="/typist">
            Send approved report to typist
          </Link>
        ) : ["with_typist", "needs_confirmation"].includes(c.status) ? (
          <Link className="primary" href={`/cases/${c.id}/typist`}>
            Check typed report
          </Link>
        ) : c.status === "delivered" ? (
          <Link className="primary" href={`/cases/${c.id}/delivered`}>
            View delivered record
          </Link>
        ) : null}
      </section>
      {c.grossEntry && (
        <section className="detail-card">
          <div className="section-title">
            <h2>Gross description</h2>
          </div>
          <p>{c.grossEntry.descriptionText}</p>
        </section>
      )}
      {c.microEntry && (
        <section className="detail-card">
          <div className="section-title">
            <h2>Microscopy</h2>
          </div>
          <p>{c.microEntry.dictation}</p>
          {c.microEntry.provisionalDx && (
            <p>
              <b>Provisional:</b> {c.microEntry.provisionalDx}
            </p>
          )}
        </section>
      )}
      <section className="detail-card">
        <div className="section-title">
          <h2>Events</h2>
          <span>{c.events.length}</span>
        </div>
        {c.events.map((e) => (
          <div className="event" key={e.id}>
            <div>
              <strong>{e.type.replaceAll("_", " ")}</strong>
              <span>{new Date(e.at).toLocaleString()}</span>
            </div>
          </div>
        ))}
      </section>
      <AppNav active="cases" />
    </main>
  );
}
