"use client";
import Link from "@/app/components/ActionLink";
import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import type { CaseStatus } from "@prisma/client";
import AppNav from "@/app/components/AppNav";
import { LoadingState } from "@/app/components/ScreenState";
import { apiFetch } from "@/lib/api-fetch";
import { runConfirmedAction } from "@/lib/client-actions";
import { caseNextAction } from "@/lib/case-navigation";
import { useRegisterActions } from "@/app/components/ActionProvider";
import { defineAction, type AnyAction } from "@/lib/actions";
import { specimenName } from "@/lib/specimens";
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
  locked: boolean;
  reminders: { id: number; text: string; dueAt: string }[];
};
export default function CasePage({ params }: { params: { id: string } }) {
  const [c, setC] = useState<Case | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reminderText, setReminderText] = useState("");
  const [reminderWhen, setReminderWhen] = useState("");
  const [bypassMode, setBypassMode] = useState<"skip" | "force" | null>(null);
  const [bypassReason, setBypassReason] = useState("");
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
      id: "set_case_reminder",
      description: "Set this case reminder text and date.",
      args: z.object({
        text: z.string().optional(),
        when: z.string().optional(),
      }),
      screens: ["case_detail"],
      risk: "safe",
      describe: () => "Set case reminder",
      run: ({ text, when }) => {
        if (text !== undefined) setReminderText(text);
        if (when !== undefined) setReminderWhen(when);
      },
    }),
    defineAction({
      id: "create_case_reminder",
      description: "Create a reminder for this case.",
      args: z.object({}),
      screens: ["case_detail"],
      risk: "confirm",
      describe: () => `Save reminder ${reminderText} for ${reminderWhen}`,
      run: async (_args, ctx) => {
        await runConfirmedAction("create_reminder", {
          caseId: Number(params.id),
          text: reminderText,
          when: reminderWhen,
          source: ctx.source,
        });
        setReminderText("");
        setReminderWhen("");
        await load();
      },
    }),
    defineAction({
      id: "complete_case_reminder",
      description: "Complete this case reminder.",
      args: z.object({ id: z.number().int().positive() }),
      screens: ["case_detail"],
      risk: "confirm",
      describe: () => "Complete reminder",
      run: async ({ id }, ctx) => {
        await runConfirmedAction("complete_reminder", {
          id,
          source: ctx.source,
        });
        await load();
      },
    }),
    defineAction({
      id: "set_case_bypass",
      description: "Set skip or force mode and reason.",
      args: z.object({
        mode: z.enum(["skip", "force"]).nullable().optional(),
        reason: z.string().optional(),
      }),
      screens: ["case_detail"],
      risk: "safe",
      describe: () => "Set bypass details",
      run: ({ mode, reason }) => {
        if (mode !== undefined) setBypassMode(mode);
        if (reason !== undefined) setBypassReason(reason);
      },
    }),
    defineAction({
      id: "bypass_pending_step",
      description: "Skip or force the pending case step.",
      args: z.object({}),
      screens: ["case_detail"],
      risk: "confirm",
      describe: () => `${bypassMode} pending step because ${bypassReason}`,
      run: async (_args, ctx) => {
        const step = c?.steps.find((value) => value.status === "pending")?.step;
        if (!step || !bypassMode) throw new Error("No pending step selected");
        await runConfirmedAction("bypass_step", {
          caseId: Number(params.id),
          step,
          mode: bypassMode,
          reason: bypassReason,
          source: ctx.source,
        });
        await load();
      },
    }),
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
    reminder: { text: reminderText, when: reminderWhen },
    bypass: { mode: bypassMode, reason: bypassReason },
  }));
  if (!c || !nextAction)
    return (
      <main className="app-shell">
        <LoadingState label="Loading case" />
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
            {specimenName(c.specimenType)} · {c.priority}
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
      {!c.locked && (
        <section className="detail-card">
          <h2>Edit entries</h2>
          <div className="gross-actions">
            {c.status === "gross_pending" && (
              <Link
                data-action="navigate"
                className="secondary"
                href={`/cases/${c.id}/gross`}
              >
                Gross
              </Link>
            )}
            {c.status === "micro_pending" && (
              <Link
                data-action="navigate"
                className="secondary"
                href={`/cases/${c.id}/micro`}
              >
                Microscopy
              </Link>
            )}
            {c.status === "with_consultant" && (
              <Link
                data-action="navigate"
                className="secondary"
                href={`/cases/${c.id}/consultant`}
              >
                Consultant
              </Link>
            )}
            {c.status === "report_draft" && (
              <Link
                data-action="navigate"
                className="secondary"
                href={`/cases/${c.id}/report`}
              >
                Report
              </Link>
            )}
          </div>
        </section>
      )}
      {!c.locked && (
        <section className="detail-card form-stack">
          <h2>Reminder</h2>
          <input
            data-action="set_case_reminder"
            value={reminderText}
            placeholder="Check colon IHC"
            onChange={(event) =>
              void actions.run("set_case_reminder", {
                text: event.target.value,
              })
            }
          />
          <input
            data-action="set_case_reminder"
            value={reminderWhen}
            placeholder="Thursday"
            onChange={(event) =>
              void actions.run("set_case_reminder", {
                when: event.target.value,
              })
            }
          />
          <button
            className="secondary"
            data-action="create_case_reminder"
            disabled={!reminderText || !reminderWhen}
            onClick={() => void actions.run("create_case_reminder")}
          >
            Add reminder
          </button>
          {c.reminders.map((item) => (
            <div className="summary-row" key={item.id}>
              <b>{item.text}</b>
              <span>{new Date(item.dueAt).toLocaleDateString()}</span>
              <button
                data-action="complete_case_reminder"
                onClick={() =>
                  void actions.run("complete_case_reminder", { id: item.id })
                }
              >
                Done
              </button>
            </div>
          ))}
        </section>
      )}
      {!c.locked && c.steps.some((step) => step.status === "pending") && (
        <section className="detail-card form-stack">
          <h2>Skip or force pending step</h2>
          <div className="gross-actions">
            <button
              className="secondary"
              data-action="set_case_bypass"
              onClick={() =>
                void actions.run("set_case_bypass", { mode: "skip" })
              }
            >
              Skip
            </button>
            <button
              className="secondary"
              data-action="set_case_bypass"
              onClick={() =>
                void actions.run("set_case_bypass", { mode: "force" })
              }
            >
              Force
            </button>
          </div>
          {bypassMode && (
            <>
              <textarea
                data-action="set_case_bypass"
                value={bypassReason}
                placeholder="Required reason"
                onChange={(event) =>
                  void actions.run("set_case_bypass", {
                    reason: event.target.value,
                  })
                }
              />
              <button
                className="primary"
                data-action="bypass_pending_step"
                disabled={bypassReason.trim().length < 3}
                onClick={() => void actions.run("bypass_pending_step")}
              >
                Confirm {bypassMode}
              </button>
            </>
          )}
        </section>
      )}
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
