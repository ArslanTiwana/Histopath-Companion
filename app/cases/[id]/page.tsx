"use client";
import Link from "@/app/components/ActionLink";
import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import type { CaseStatus } from "@prisma/client";
import AppNav from "@/app/components/AppNav";
import { apiFetch } from "@/lib/api-fetch";
import { runConfirmedAction } from "@/lib/client-actions";
import { caseNextAction } from "@/lib/case-navigation";
import { useRegisterActions } from "@/app/components/ActionProvider";
import { defineAction, type AnyAction } from "@/lib/actions";
type Case = {
  id: number;
  caseLabel: string;
  specimenType: string | null;
  priority: string;
  status: CaseStatus;
  incomplete: boolean;
  steps: { id: number; step: string; status: string; reason: string | null }[];
  events: { id: number; type: string; at: string; payload: unknown }[];
  grossEntry?: { descriptionText: string } | null;
  microEntry?: { dictation: string; provisionalDx: string | null } | null;
};
export default function CasePage({ params }: { params: { id: string } }) {
  const [c, setC] = useState<Case | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setC(await apiFetch<Case>(`/api/cases/${params.id}`));
  }, [params.id]);
  useEffect(() => {
    void load();
  }, [load]);
  async function sendToConsultant() {
    if (!c) return;
    setBusy(true);
    setError("");
    try {
      await runConfirmedAction("send_to_consultant", {
        caseIds: [c!.id],
        source: "tap",
      });
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not advance case",
      );
    } finally {
      setBusy(false);
    }
  }
  const nextAction = c ? caseNextAction(c.status, c.id) : null;
  const screenActions: AnyAction[] = [
    defineAction({
      id: "move_to_next_step",
      description: "Open or execute the case's current next step.",
      args: z.object({}),
      screens: ["case_detail"],
      risk: nextAction?.kind === "send_to_consultant" ? "confirm" : "safe",
      describe: () => nextAction?.label || "Open next step",
      run: () =>
        nextAction?.kind === "link"
          ? window.location.assign(nextAction.href)
          : sendToConsultant(),
    }),
  ];
  const actions = useRegisterActions("case_detail", screenActions, () => ({
    screenId: "case_detail",
    caseLabel: c?.caseLabel,
    status: c?.status,
    nextAction: nextAction?.label,
    modal: null,
  }));
  if (!c || !nextAction)
    return (
      <main className="app-shell">
        <p>Loading…</p>
      </main>
    );
  return (
    <main className="app-shell">
      <Link data-action="navigate" href="/" className="back">
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
        {nextAction.kind === "link" ? (
          <Link
            data-action="move_to_next_step"
            onClick={(event) => {
              event.preventDefault();
              void actions.run("move_to_next_step");
            }}
            className="primary"
            href={nextAction.href}
          >
            {nextAction.label}
          </Link>
        ) : (
          <button
            className="primary"
            data-action="move_to_next_step"
            disabled={busy}
            onClick={() => void actions.run("move_to_next_step")}
          >
            {busy ? "Sending…" : nextAction.label}
          </button>
        )}
        {error && <div className="error">{error}</div>}
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
