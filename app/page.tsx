"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import VoiceBar from "./components/VoiceBar";
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
type Case = {
  id: number;
  caseLabel: string;
  specimenType: string | null;
  priority: "routine" | "urgent";
  status: string;
  incomplete: boolean;
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
    }).then((x) => {
      setSetup(x.setup);
      if (x.authenticated) onReady();
    });
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
      (filter === "incomplete" && c.incomplete) ||
      (filter === "batch" && c.batch?.id === activeBatch?.id) ||
      (filter === "single" && !c.batch),
  );
  const activeBatchCount = activeBatch
    ? cases.filter((item) => item.batch?.id === activeBatch.id).length
    : 0;
  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const pending = await prepareAction(
        showNew === "batch" ? "create_batch" : "create_case",
        showNew === "batch"
          ? {
              name:
                String(data.name || "").trim() ||
                `Batch ${new Date().toLocaleDateString()}`,
              start: String(data.start || "").toUpperCase(),
              end: String(data.end || "").toUpperCase(),
              source: "tap",
            }
          : {
              caseLabel: String(data.caseLabel || "").toUpperCase(),
              specimenType: String(data.specimenType || "").trim() || undefined,
              priority: data.priority,
              source: "tap",
            },
      );
      setIntakePending(pending);
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "Could not prepare cases",
      );
    }
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
  async function sendConsultant() {
    try {
      const response = await runConfirmedAction<{
        ready: string[];
        notReady: string[];
      }>("send_to_consultant", {
        caseIds: selectedConsultant,
        source: "tap",
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
        <button className="icon-button" onClick={() => setShowNew("single")}>
          ＋ Case
        </button>
      </header>
      <div className="quick-links">
        <Link href="/search">⌕ Search cases</Link>
        <Link href="/end-day">End of day →</Link>
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
            ["incomplete", "Incomplete"],
          ].map(([v, t]) => (
            <button
              className={filter === v ? "chip active" : "chip"}
              onClick={() => setFilter(v)}
              key={v}
            >
              {t}
            </button>
          ))}
        </div>
        <button className="primary small" onClick={() => setShowNew("batch")}>
          ＋ New batch
        </button>
      </div>
      {nextGrossCase(shown) && (
        <Link
          className="primary next-gross"
          href={`/cases/${nextGrossCase(shown)!.id}/gross`}
        >
          Start next gross · {nextGrossCase(shown)!.caseLabel}
        </Link>
      )}
      {cases.some((item) => item.status === "micro_done") && (
        <button
          className="secondary wide consultant-button"
          onClick={openConsultant}
        >
          Send cases to consultant
        </button>
      )}
      {cases.some((item) => item.status === "report_approved") && (
        <Link className="primary wide" href="/typist">
          Send approved reports to typist
        </Link>
      )}
      <section className="attention">
        <div className="section-title">
          <h2>Needs attention</h2>
          <span>
            {
              cases.filter((c) => c.incomplete || c.priority === "urgent")
                .length
            }
          </span>
        </div>
        {cases
          .filter((c) => c.incomplete || c.priority === "urgent")
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
              onClick={() => {
                if (intakePending) void cancelAction(intakePending.token);
                setIntakePending(null);
                setShowNew(null);
              }}
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
                    onClick={() => {
                      void cancelAction(intakePending.token);
                      setIntakePending(null);
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="primary"
                    onClick={() => void confirmIntake()}
                  >
                    Confirm and create
                  </button>
                </div>
              </div>
            ) : showNew === "batch" ? (
              <>
                <label>
                  Batch name
                  <input name="name" placeholder="October 22 grossing" />
                </label>
                <div className="two">
                  <label>
                    From
                    <input name="start" required placeholder="S-101" />
                  </label>
                  <label>
                    To
                    <input name="end" required placeholder="S-140" />
                  </label>
                </div>
              </>
            ) : (
              <>
                <label>
                  Case ID
                  <input name="caseLabel" required placeholder="S-141" />
                </label>
                <label>
                  Specimen
                  <input name="specimenType" placeholder="Skin ellipse" />
                </label>
                <label>
                  Priority
                  <select name="priority" defaultValue="routine">
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
              <button className="primary">
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
            <button className="close" onClick={() => setConsultantOpen(false)}>
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
                    checked={selectedConsultant.includes(item.id)}
                    onChange={(event) =>
                      setSelectedConsultant((current) =>
                        event.target.checked
                          ? [...current, item.id]
                          : current.filter((id) => id !== item.id),
                      )
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
              disabled={!selectedConsultant.length}
              onClick={() => void sendConsultant()}
            >
              Confirm bulk send
            </button>
          </div>
        </div>
      )}
      <VoiceBar />
      <AppNav />
    </main>
  );
}
function CaseRow({ c }: { c: Case }) {
  return (
    <Link href={`/cases/${c.id}`} className="case-row">
      <div>
        <strong>{c.caseLabel}</strong>
        <span>
          {c.specimenType || "Specimen not set"} ·{" "}
          {c.batch?.name || "Single case"}
        </span>
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
  const [ready, setReady] = useState(false);
  const openSession = useCallback(() => {
    const today = localDateKey();
    if (localStorage.getItem("histopath_briefing_seen") !== today) {
      window.location.href = "/briefing";
      return;
    }
    setReady(true);
  }, []);
  return ready ? <Dashboard /> : <PinGate onReady={openSession} />;
}
