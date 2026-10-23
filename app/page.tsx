"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "./components/ActionLink";
import { z } from "zod";
import AppNav from "./components/AppNav";
import { apiFetch } from "@/lib/api-fetch";
import {
  cancelAction,
  confirmAction,
  prepareAction,
  runConfirmedAction,
  type PendingActionResponse,
} from "@/lib/client-actions";
import { localDateKey } from "@/lib/local-date";
import { nextGrossCase, readyConsultantCaseIds } from "@/lib/worklist";
import { useAuthState } from "./components/AuthState";
import { useRegisterActions } from "./components/ActionProvider";
import { defineAction, type AnyAction } from "@/lib/actions";
import { specimenName } from "@/lib/specimens";
type Case = {
  id: number;
  caseLabel: string;
  specimenType: string | null;
  priority: "routine" | "urgent";
  status: string;
  incomplete: boolean;
  attention: string[];
  batch?: { id: number; name: string } | null;
};
const labels: Record<string, string> = {
  gross_pending: "Gross",
  micro_pending: "Micro",
  micro_done: "Consultant",
  with_consultant: "Consultant",
  consultant_dx_added: "Report",
  report_draft: "Report",
  report_approved: "Typist",
  with_typist: "Typist",
  needs_confirmation: "Confirm",
  delivered: "Delivered",
};
function PinGate({ onReady }: { onReady: () => void }) {
  const [setup, setSetup] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    apiFetch<{ setup: boolean; authenticated: boolean }>("/api/auth", {
      redirectOn401: false,
    })
      .then((x) => {
        setSetup(x.setup);
        if (x.authenticated) onReady();
      })
      .catch((cause) =>
        setError(
          cause instanceof Error ? cause.message : "Could not check the PIN",
        ),
      );
  }, [onReady]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apiFetch<{ ok: boolean }>("/api/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pin, setup }),
        redirectOn401: false,
      });
      onReady();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not unlock");
    }
  }
  return (
    <main className="pin-shell">
      <div className="pin-card">
        <div className="eyebrow">HISTOPATH COMPANION</div>
        <h1>{setup ? "Set your private PIN" : "Welcome back"}</h1>
        <p>
          {setup
            ? "Choose a four digit PIN. Its secure hash is stored on the server."
            : "Enter your PIN to open today's worklist."}
        </p>
        <form onSubmit={submit}>
          <input
            autoFocus
            inputMode="numeric"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            placeholder="••••"
          />
          <button className="primary" disabled={pin.length !== 4}>
            {setup ? "Create PIN" : "Unlock"}
          </button>
        </form>
        {error && <div className="error">{error}</div>}
      </div>
    </main>
  );
}
function Dashboard() {
  const [cases, setCases] = useState<Case[]>([]);
  const [filter, setFilter] = useState("all");
  const [showNew, setShowNew] = useState<"batch" | "single" | null>(null);
  const [message, setMessage] = useState("");
  const [consultantOpen, setConsultantOpen] = useState(false);
  const [selectedConsultant, setSelectedConsultant] = useState<number[]>([]);
  const [intakeDraft, setIntakeDraft] = useState({
    name: "",
    start: "",
    end: "",
    caseLabel: "",
    specimenType: "",
    priority: "routine",
  });
  const [intakePending, setIntakePending] =
    useState<PendingActionResponse | null>(null);
  async function load() {
    try {
      setCases(await apiFetch<Case[]>("/api/cases"));
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "Could not load cases",
      );
    }
  }
  useEffect(() => {
    load();
    const reload = () => void load();
    const applyVoiceFilter = (event: Event) =>
      setFilter((event as CustomEvent<string>).detail);
    window.addEventListener("cases-changed", reload);
    window.addEventListener("voice-filter", applyVoiceFilter);
    return () => {
      window.removeEventListener("cases-changed", reload);
      window.removeEventListener("voice-filter", applyVoiceFilter);
    };
  }, []);
  const counts = useMemo(
    () =>
      cases.reduce<Record<string, number>>(
        (a, c) => (
          (a[labels[c.status] || c.status] =
            (a[labels[c.status] || c.status] || 0) + 1),
          a
        ),
        {},
      ),
    [cases],
  );
  const activeBatch =
    filter === "batch" ? cases.find((item) => item.batch)?.batch || null : null;
  const shown = cases.filter(
    (c) =>
      filter === "all" ||
      (filter === "pending" && c.status !== "delivered") ||
      (filter === "stuck" && c.attention.includes("overdue")) ||
      (filter === "incomplete" && c.incomplete) ||
      (filter === "batch" && c.batch?.id === activeBatch?.id) ||
      (filter === "single" && !c.batch),
  );
  const activeBatchCount = activeBatch
    ? cases.filter((item) => item.batch?.id === activeBatch.id).length
    : 0;
  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void actions.run(
      showNew === "batch" ? "create_batch" : "create_case",
      showNew === "batch"
        ? {
            name:
              intakeDraft.name.trim() ||
              `Batch ${new Date().toLocaleDateString()}`,
            start: intakeDraft.start.toUpperCase(),
            end: intakeDraft.end.toUpperCase(),
          }
        : {
            caseLabel: intakeDraft.caseLabel.toUpperCase(),
            specimenType: intakeDraft.specimenType.trim() || undefined,
            priority: intakeDraft.priority,
          },
    );
  }
  async function confirmIntake() {
    if (!intakePending) return;
    try {
      await confirmAction(intakePending.token);
      setMessage("Created");
      setIntakePending(null);
      setShowNew(null);
      await load();
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "Could not create cases",
      );
    }
  }
  function openConsultant() {
    setMessage("");
    setSelectedConsultant(readyConsultantCaseIds(cases));
    setConsultantOpen(true);
  }
  async function sendConsultant(
    source: "tap" | "voice" = "tap",
    range?: { start?: string; end?: string },
  ) {
    const first = Number(range?.start?.match(/\d+/)?.[0]);
    const last = Number(range?.end?.match(/\d+/)?.[0]);
    const caseIds =
      Number.isInteger(first) && Number.isInteger(last)
        ? cases
            .filter((item) => {
              const number = Number(item.caseLabel.match(/\d+/)?.[0]);
              return number >= first && number <= last;
            })
            .map((item) => item.id)
        : selectedConsultant;
    try {
      const response = await runConfirmedAction<{
        ready: string[];
        notReady: string[];
      }>("send_to_consultant", {
        caseIds,
        source,
      });
      setMessage(
        `Sent ${response.result.ready.length}; ${response.result.notReady.length} not ready.`,
      );
      setConsultantOpen(false);
      await load();
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "Could not send cases",
      );
    }
  }
  const screenActions: AnyAction[] = [
    defineAction({
      id: "next_case",
      description: "Open the next gross case in the active worklist filter.",
      args: z.object({}),
      screens: ["worklist"],
      risk: "safe",
      describe: () => "Open next gross case",
      run: () => {
        const next = nextGrossCase(shown);
        if (!next)
          throw new Error(
            "There are no cases waiting for grossing in this filter.",
          );
        window.location.href = `/cases/${next.id}/gross`;
      },
    }),
    defineAction({
      id: "set_intake_field",
      description: "Set a case intake field.",
      args: z.object({
        field: z.enum([
          "name",
          "start",
          "end",
          "caseLabel",
          "specimenType",
          "priority",
        ]),
        value: z.string(),
      }),
      screens: ["worklist"],
      risk: "safe",
      describe: ({ field }) => `Set intake ${field}`,
      run: ({ field, value }) =>
        setIntakeDraft((current) => ({ ...current, [field]: value })),
    }),
    defineAction({
      id: "create_case",
      description: "Create a single independent case.",
      args: z.object({
        caseLabel: z.string(),
        specimenType: z.string().optional(),
        priority: z.enum(["routine", "urgent"]).default("routine"),
      }),
      screens: ["worklist"],
      risk: "confirm",
      describe: ({ caseLabel }) => `Create ${caseLabel}`,
      run: async (args, ctx) => {
        try {
          if (ctx.confirmed) {
            await runConfirmedAction("create_case", {
              ...args,
              source: ctx.source,
            });
            setShowNew(null);
            await load();
          } else
            setIntakePending(
              await prepareAction("create_case", {
                ...args,
                source: ctx.source,
              }),
            );
        } catch (cause) {
          setMessage(
            cause instanceof Error ? cause.message : "Could not prepare case",
          );
        }
      },
    }),
    defineAction({
      id: "create_batch",
      description: "Create independent cases under one batch label.",
      args: z.object({ name: z.string(), start: z.string(), end: z.string() }),
      screens: ["worklist"],
      risk: "confirm",
      describe: ({ start, end }) => `Create ${start} to ${end}`,
      run: async (args, ctx) => {
        try {
          if (ctx.confirmed) {
            await runConfirmedAction("create_batch", {
              ...args,
              source: ctx.source,
            });
            setShowNew(null);
            await load();
          } else
            setIntakePending(
              await prepareAction("create_batch", {
                ...args,
                source: ctx.source,
              }),
            );
        } catch (cause) {
          setMessage(
            cause instanceof Error ? cause.message : "Could not prepare batch",
          );
        }
      },
    }),
    defineAction({
      id: "confirm_intake",
      description: "Confirm the intake read-back.",
      args: z.object({}),
      screens: ["worklist"],
      risk: "safe",
      describe: () => "Confirm intake",
      run: confirmIntake,
    }),
    defineAction({
      id: "cancel_intake_pending",
      description: "Cancel the pending intake read-back and edit it.",
      args: z.object({}),
      screens: ["worklist"],
      risk: "safe",
      describe: () => "Edit intake",
      run: async () => {
        if (intakePending) await cancelAction(intakePending.token);
        setIntakePending(null);
      },
    }),
    defineAction({
      id: "set_filter",
      description: "Filter the worklist.",
      args: z.object({
        filter: z.enum([
          "all",
          "pending",
          "stuck",
          "incomplete",
          "batch",
          "single",
        ]),
      }),
      screens: ["worklist"],
      risk: "safe",
      describe: ({ filter: value }) => `Show ${value} cases`,
      run: ({ filter: value }) => setFilter(value),
    }),
    defineAction({
      id: "open_intake",
      description: "Open single-case or batch intake.",
      args: z.object({ kind: z.enum(["single", "batch"]) }),
      screens: ["worklist"],
      risk: "safe",
      describe: ({ kind }) => `Open ${kind} intake`,
      run: ({ kind }) => setShowNew(kind),
    }),
    defineAction({
      id: "close_intake",
      description: "Close case intake.",
      args: z.object({}),
      screens: ["worklist"],
      risk: "safe",
      describe: () => "Close intake",
      run: () => {
        if (intakePending) void cancelAction(intakePending.token);
        setIntakePending(null);
        setShowNew(null);
      },
    }),
    defineAction({
      id: "open_consultant_send",
      description: "Open consultant bulk selection.",
      args: z.object({}),
      screens: ["worklist"],
      risk: "safe",
      describe: () => "Select cases for consultant",
      run: openConsultant,
    }),
    defineAction({
      id: "close_consultant_send",
      description: "Close consultant selection.",
      args: z.object({}),
      screens: ["worklist"],
      risk: "safe",
      describe: () => "Close consultant selection",
      run: () => setConsultantOpen(false),
    }),
    defineAction({
      id: "select_consultant_case",
      description: "Select or deselect a case for consultant.",
      args: z.object({
        caseId: z.number().int().positive(),
        selected: z.boolean(),
      }),
      screens: ["worklist"],
      risk: "safe",
      describe: ({ caseId, selected }) =>
        `${selected ? "Select" : "Deselect"} case ${caseId}`,
      run: ({ caseId, selected }) =>
        setSelectedConsultant((current) =>
          selected
            ? Array.from(new Set([...current, caseId]))
            : current.filter((id) => id !== caseId),
        ),
    }),
    defineAction({
      id: "send_to_consultant",
      description: "Send selected ready cases to consultant.",
      args: z.object({
        start: z.string().optional(),
        end: z.string().optional(),
      }),
      screens: ["worklist"],
      risk: "confirm",
      describe: () =>
        `Send ${selectedConsultant.length} selected cases to consultant`,
      run: (args, ctx) => sendConsultant(ctx.source, args),
    }),
  ];
  const actions = useRegisterActions("worklist", screenActions, () => ({
    screenId: "worklist",
    filter,
    visibleCases: shown.map((item) => item.caseLabel),
    modal: showNew || (consultantOpen ? "consultant_send" : null),
    selectedConsultant,
    intakeDraft,
  }));
  return (
    <main className="app-shell">
      <header>
        <div>
          <div className="eyebrow">
            {activeBatch ? activeBatch.name : "TODAY"} ·{" "}
            {activeBatch ? activeBatchCount : cases.length} cases
          </div>
          <h1>Worklist</h1>
        </div>
        <button
          data-action="open_intake"
          className="icon-button"
          onClick={() => void actions.run("open_intake", { kind: "single" })}
        >
          ＋ Case
        </button>
      </header>
      <div className="quick-links">
        <Link data-action="navigate" href="/search">
          ⌕ Search cases
        </Link>
        <Link data-action="navigate" href="/end-day">
          End of day →
        </Link>
      </div>
      <section className="stage-grid">
        {["Gross", "Micro", "Consultant", "Typist", "Confirm"].map((x) => (
          <div className="stage" key={x}>
            <span>{x}</span>
            <strong>{counts[x] || 0}</strong>
          </div>
        ))}
      </section>
      {message && <div className="notice">{message}</div>}
      <div className="toolbar">
        <div className="chips">
          {[
            ["all", "All"],
            ["batch", "Batch"],
            ["single", "Single"],
            ["stuck", "Stuck"],
            ["incomplete", "Incomplete"],
          ].map(([v, t]) => (
            <button
              className={filter === v ? "chip active" : "chip"}
              data-action="set_filter"
              onClick={() => void actions.run("set_filter", { filter: v })}
              key={v}
            >
              {t}
            </button>
          ))}
        </div>
        <button
          data-action="open_intake"
          className="primary small"
          onClick={() => void actions.run("open_intake", { kind: "batch" })}
        >
          ＋ New batch
        </button>
      </div>
      {nextGrossCase(shown) && (
        <Link
          className="primary next-gross"
          data-action="next_case"
          onClick={(event) => {
            event.preventDefault();
            void actions.run("next_case");
          }}
          href={`/cases/${nextGrossCase(shown)!.id}/gross`}
        >
          Start next gross · {nextGrossCase(shown)!.caseLabel}
        </Link>
      )}
      {cases.some((item) => item.status === "micro_done") && (
        <button
          className="secondary wide consultant-button"
          data-action="open_consultant_send"
          onClick={() => void actions.run("open_consultant_send")}
        >
          Send cases to consultant
        </button>
      )}
      {cases.some((item) => item.status === "report_approved") && (
        <Link data-action="navigate" className="primary wide" href="/typist">
          Send approved reports to typist
        </Link>
      )}
      <section className="attention">
        <div className="section-title">
          <h2>Needs attention</h2>
          <span>{cases.filter((c) => c.attention.length > 0).length}</span>
        </div>
        {cases
          .filter((c) => c.attention.length > 0)
          .slice(0, 3)
          .map((c) => (
            <CaseRow c={c} key={c.id} />
          ))}
      </section>
      <section>
        <div className="section-title">
          <h2>All cases</h2>
          <span>{shown.length}</span>
        </div>
        <div className="case-list">
          {shown.map((c) => (
            <CaseRow c={c} key={c.id} />
          ))}
          {!shown.length && (
            <p className="empty">No cases match this filter.</p>
          )}
        </div>
      </section>
      <div className="voice-hint">
        <b>Try saying</b>
        <span>
          Next case · Show stuck cases · Send S-101 to S-120 to consultant
        </span>
      </div>
      {showNew && (
        <div className="modal">
          <form className="modal-card" onSubmit={create}>
            <button
              type="button"
              className="close"
              data-action="close_intake"
              onClick={() => void actions.run("close_intake")}
            >
              ×
            </button>
            <div className="eyebrow">
              {showNew === "batch" ? "VOICE INTAKE" : "QUICK ADD"}
            </div>
            <h2>{showNew === "batch" ? "New batch" : "Add single case"}</h2>
            {intakePending ? (
              <div className="readback">
                <p>{intakePending.readBackText}</p>
                <div className="gross-actions">
                  <button
                    type="button"
                    className="secondary"
                    data-action="cancel_intake_pending"
                    onClick={() => void actions.run("cancel_intake_pending")}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="primary"
                    data-action="confirm"
                    onClick={() => void actions.run("confirm_intake")}
                  >
                    Confirm and create
                  </button>
                </div>
              </div>
            ) : showNew === "batch" ? (
              <>
                <label>
                  Batch name
                  <input
                    data-action="set_intake_field"
                    name="name"
                    value={intakeDraft.name}
                    onChange={(event) =>
                      void actions.run("set_intake_field", {
                        field: "name",
                        value: event.target.value,
                      })
                    }
                    placeholder="October 22 grossing"
                  />
                </label>
                <div className="two">
                  <label>
                    From
                    <input
                      data-action="set_intake_field"
                      name="start"
                      value={intakeDraft.start}
                      onChange={(event) =>
                        void actions.run("set_intake_field", {
                          field: "start",
                          value: event.target.value,
                        })
                      }
                      required
                      placeholder="S-101"
                    />
                  </label>
                  <label>
                    To
                    <input
                      data-action="set_intake_field"
                      name="end"
                      value={intakeDraft.end}
                      onChange={(event) =>
                        void actions.run("set_intake_field", {
                          field: "end",
                          value: event.target.value,
                        })
                      }
                      required
                      placeholder="S-140"
                    />
                  </label>
                </div>
              </>
            ) : (
              <>
                <label>
                  Case ID
                  <input
                    data-action="set_intake_field"
                    name="caseLabel"
                    value={intakeDraft.caseLabel}
                    onChange={(event) =>
                      void actions.run("set_intake_field", {
                        field: "caseLabel",
                        value: event.target.value,
                      })
                    }
                    required
                    placeholder="S-141"
                  />
                </label>
                <label>
                  Specimen
                  <input
                    data-action="set_intake_field"
                    name="specimenType"
                    value={intakeDraft.specimenType}
                    onChange={(event) =>
                      void actions.run("set_intake_field", {
                        field: "specimenType",
                        value: event.target.value,
                      })
                    }
                    placeholder="Skin ellipse"
                  />
                </label>
                <label>
                  Priority
                  <select
                    data-action="set_intake_field"
                    name="priority"
                    value={intakeDraft.priority}
                    onChange={(event) =>
                      void actions.run("set_intake_field", {
                        field: "priority",
                        value: event.target.value,
                      })
                    }
                  >
                    <option value="routine">Routine</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </label>
              </>
            )}
            {!intakePending && (
              <p className="form-note">
                {showNew === "batch"
                  ? "Each case is created as a full, independent case. The batch is only a label for bulk actions."
                  : "No batch needed. This case uses the same steps and statuses as batch cases."}
              </p>
            )}
            {!intakePending && (
              <button
                data-action={
                  showNew === "batch" ? "create_batch" : "create_case"
                }
                className="primary"
              >
                {showNew === "batch" ? "Create cases" : "Add case"}
              </button>
            )}
            {message && <div className="error">{message}</div>}
          </form>
        </div>
      )}
      {consultantOpen && (
        <div className="modal">
          <div className="modal-card">
            <button
              data-action="close_consultant_send"
              className="close"
              onClick={() => void actions.run("close_consultant_send")}
            >
              ×
            </button>
            <div className="eyebrow">BULK SEND</div>
            <h2>Send to consultant?</h2>
            <p>
              {
                selectedConsultant.filter(
                  (id) =>
                    cases.find((item) => item.id === id)?.status ===
                    "micro_done",
                ).length
              }{" "}
              ready ·{" "}
              {
                selectedConsultant.filter(
                  (id) =>
                    cases.find((item) => item.id === id)?.status !==
                    "micro_done",
                ).length
              }{" "}
              not ready
            </p>
            <div className="bulk-list">
              {cases.map((item) => (
                <label key={item.id}>
                  <input
                    type="checkbox"
                    data-action="select_consultant_case"
                    checked={selectedConsultant.includes(item.id)}
                    onChange={(event) =>
                      void actions.run("select_consultant_case", {
                        caseId: item.id,
                        selected: event.target.checked,
                      })
                    }
                  />
                  <span>
                    {item.caseLabel} · {item.status.replaceAll("_", " ")}
                  </span>
                </label>
              ))}
            </div>
            <button
              className="primary"
              data-action="send_to_consultant"
              disabled={!selectedConsultant.length}
              onClick={() => void actions.run("send_to_consultant")}
            >
              Confirm bulk send
            </button>
          </div>
        </div>
      )}
      <AppNav />
    </main>
  );
}
function CaseRow({ c }: { c: Case }) {
  return (
    <Link data-action="navigate" href={`/cases/${c.id}`} className="case-row">
      <div>
        <strong>{c.caseLabel}</strong>
        <span>
          {specimenName(c.specimenType)} · {c.batch?.name || "Single case"}
        </span>
        {c.attention.length > 0 && <span>{c.attention.join(" · ")}</span>}
      </div>
      <div className="row-right">
        <span
          className={c.priority === "urgent" ? "priority urgent" : "priority"}
        >
          {c.priority}
        </span>
        <b>{labels[c.status] || c.status}</b>
        <span>›</span>
      </div>
    </Link>
  );
}
export default function Home() {
  const { authenticated, setAuthenticated } = useAuthState();
  const [ready, setReady] = useState(authenticated);
  const openSession = useCallback(() => {
    setAuthenticated(true);
    const today = localDateKey();
    if (localStorage.getItem("histopath_briefing_seen") !== today) {
      window.location.href = "/briefing";
      return;
    }
    setReady(true);
  }, [setAuthenticated]);
  useEffect(() => {
    if (authenticated) openSession();
  }, [authenticated, openSession]);
  return ready ? <Dashboard /> : <PinGate onReady={openSession} />;
}
