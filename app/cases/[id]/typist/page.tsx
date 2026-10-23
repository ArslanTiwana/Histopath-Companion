"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import AppNav from "@/app/components/AppNav";
import DictationButton from "@/app/components/DictationButton";
import { apiFetch } from "@/lib/api-fetch";
import { runConfirmedAction } from "@/lib/client-actions";

type DiffRow = {
  field: string;
  label: string;
  approved: string;
  typed: string;
  matches: boolean;
  hint?: string;
};
type Data = {
  id: number;
  caseLabel: string;
  status: string;
  report: { content: Record<string, string> } | null;
  typistChecks: {
    diff: DiffRow[];
    result: string;
    corrections: string[] | null;
  }[];
};

export default function TypistPage({ params }: { params: { id: string } }) {
  const [item, setItem] = useState<Data | null>(null);
  const [typedText, setTypedText] = useState("");
  const [review, setReview] = useState(false);
  const [diff, setDiff] = useState<DiffRow[]>([]);
  const [overrideReason, setOverrideReason] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const data = await apiFetch<Data>(`/api/cases/${params.id}/typist`);
    setItem(data);
    const latest = data.typistChecks[0];
    if (latest && latest.result !== "returned") setDiff(latest.diff);
    else {
      setDiff([]);
      setTypedText("");
      setReview(false);
    }
  }, [params.id]);
  useEffect(() => {
    void load();
  }, [load]);
  async function action(
    actionName: string,
    args: Record<string, unknown>,
    source: "tap" | "voice" = "tap",
  ) {
    setError("");
    try {
      const response = await runConfirmedAction<{ diff?: DiffRow[] }>(
        actionName,
        { caseId: Number(params.id), ...args, source },
      );
      if (response.result.diff) setDiff(response.result.diff);
      await load();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Typist action failed");
      return false;
    }
  }
  async function deliver(reason?: string, source: "tap" | "voice" = "tap") {
    if (
      await action(
        reason ? "override_delivery" : "deliver_case",
        reason ? { reason } : {},
        source,
      )
    )
      window.location.href = `/cases/${params.id}/delivered`;
  }
  async function sendBack(source: "tap" | "voice" = "tap") {
    const sent = await action(
      "send_back_typist",
      { fields: differences.map((row) => row.label) },
      source,
    );
    if (sent) {
      setDiff([]);
      setTypedText("");
      setReview(false);
    }
  }
  function voice(text: string) {
    const lower = text.toLowerCase();
    if (lower.includes("confirm") || lower.includes("deliver"))
      void deliver(undefined, "voice");
    else if (lower.includes("send back") && diff.some((row) => !row.matches))
      void sendBack("voice");
    else setTypedText((current) => (current ? `${current}\n${text}` : text));
  }
  if (!item) return <main className="app-shell">Loading…</main>;
  const differences = diff.filter((row) => !row.matches);
  return (
    <main className="app-shell">
      <Link href={`/cases/${params.id}`} className="back">
        ← Case
      </Link>
      <header>
        <div>
          <div className="eyebrow">REPORT → TYPIST → DELIVERED</div>
          <h1>Typist check · {item.caseLabel}</h1>
        </div>
        {diff.length > 0 && (
          <span className="status-pill">{differences.length} differences</span>
        )}
      </header>
      {!diff.length && (
        <>
          {review ? (
            <section className="detail-card readback">
              <h3>Typed report read-back</h3>
              <pre className="typed-preview">{typedText}</pre>
              <div className="gross-actions">
                <button className="secondary" onClick={() => setReview(false)}>
                  Edit
                </button>
                <button
                  className="primary"
                  onClick={() => void action("check_typist", { typedText })}
                >
                  Confirm and compare
                </button>
              </div>
            </section>
          ) : (
            <section className="detail-card">
              <label className="field-label">
                Paste the typed report
                <textarea
                  value={typedText}
                  onChange={(event) => setTypedText(event.target.value)}
                  placeholder={
                    "Diagnosis: …\nGrade: …\nStage: …\nMargins: …\nLaterality: …\nTumour size: …"
                  }
                />
              </label>
              <DictationButton
                label="Dictate typed report"
                onTranscript={(text) =>
                  setTypedText((current) =>
                    current ? `${current}\n${text}` : text,
                  )
                }
              />
              <button
                className="primary wide"
                disabled={typedText.trim().length < 10}
                onClick={() => {
                  setReview(true);
                  window.speechSynthesis?.speak(
                    new SpeechSynthesisUtterance(typedText),
                  );
                }}
              >
                Read back before comparing
              </button>
            </section>
          )}
        </>
      )}
      {diff.length > 0 && (
        <>
          <div className="comparison-table">
            <div className="comparison-head">
              <b>Field</b>
              <b>Approved</b>
              <b>Typed</b>
            </div>
            {diff.map((row) => (
              <div
                className={
                  row.matches
                    ? "comparison-row match"
                    : "comparison-row difference"
                }
                key={row.field}
              >
                <b>{row.label}</b>
                <span>{row.approved}</span>
                <span>
                  {row.typed} {row.matches ? "✓" : "✕"}
                </span>
                {row.hint && <small>{row.hint}</small>}
              </div>
            ))}
          </div>
          {differences.length ? (
            <>
              <p className="error">
                {differences.some((row) => row.hint)
                  ? "Digits look swapped. "
                  : ""}
                Delivery stays locked until every field matches.
              </p>
              <button
                className="secondary wide"
                onClick={() => void sendBack()}
              >
                Send back to typist
              </button>
              <details className="override-box">
                <summary>Override with a reason</summary>
                <textarea
                  value={overrideReason}
                  onChange={(event) => setOverrideReason(event.target.value)}
                  placeholder="Reason required"
                />
                <button
                  className="primary wide"
                  disabled={overrideReason.trim().length < 3}
                  onClick={() => void deliver(overrideReason)}
                >
                  Confirm override and deliver
                </button>
              </details>
            </>
          ) : (
            <button className="primary wide" onClick={() => void deliver()}>
              Confirm &amp; deliver
            </button>
          )}
          <DictationButton
            label="Say send back or confirm delivery"
            onTranscript={voice}
          />
        </>
      )}
      {error && <div className="error">{error}</div>}
      <AppNav active="cases" />
    </main>
  );
}
