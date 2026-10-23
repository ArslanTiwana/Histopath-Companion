"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppNav from "@/app/components/AppNav";
import DictationButton from "@/app/components/DictationButton";
import { apiFetch } from "@/lib/api-fetch";
import { runConfirmedAction } from "@/lib/client-actions";

type Data = {
  caseLabel: string;
  status: string;
  locked: boolean;
  deliveredAt: string | null;
  steps: {
    id: number;
    step: string;
    status: string;
    completedAt: string | null;
  }[];
};
const stepNames: Record<string, string> = {
  gross: "Gross",
  micro: "Micro",
  consultant: "Consultant",
  report: "Report approved",
  typist: "Typist confirmed",
  delivered: "Delivered",
};

export default function DeliveredPage({ params }: { params: { id: string } }) {
  const [item, setItem] = useState<Data | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    apiFetch<Data>(`/api/cases/${params.id}/delivered`).then(setItem);
  }, [params.id]);
  async function unlock(
    source: "tap" | "voice" = "tap",
    spokenReason = reason,
  ) {
    setBusy(true);
    setError("");
    try {
      await runConfirmedAction("unlock_case", {
        caseId: Number(params.id),
        reason: spokenReason,
        source,
      });
      window.location.href = `/cases/${params.id}`;
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not unlock case",
      );
      setBusy(false);
    }
  }
  if (!item) return <main className="app-shell">Loading…</main>;
  return (
    <main className="app-shell">
      <header>
        <div>
          <div className="eyebrow">LOCKED</div>
          <h1>Delivered · {item.caseLabel}</h1>
        </div>
        <span className="delivered-pill">✓ Delivered</span>
      </header>
      <p className="delivery-time">
        Delivered{" "}
        {item.deliveredAt ? new Date(item.deliveredAt).toLocaleString() : ""}
      </p>
      <section className="delivery-timeline">
        {item.steps
          .filter((step) => step.status === "done")
          .map((step) => (
            <div key={step.id}>
              <span>✓</span>
              <b>{stepNames[step.step] || step.step}</b>
              <time>
                {step.completedAt
                  ? new Date(step.completedAt).toLocaleString()
                  : "Complete"}
              </time>
            </div>
          ))}
      </section>
      <p className="locked-note">
        🔒 Locked. Changes need an unlock with a reason, which is logged.
      </p>
      <details className="override-box">
        <summary>Unlock with a reason</summary>
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Reason required"
        />
        <button
          className="primary wide"
          disabled={busy || reason.trim().length < 3}
          onClick={() => void unlock()}
        >
          Confirm unlock
        </button>
        <DictationButton
          label="Say unlock because…"
          onTranscript={(text) => {
            const spoken = text.match(/^unlock(?: case)? because\s+(.+)/i)?.[1];
            if (spoken) void unlock("voice", spoken);
            else setError("Say unlock because, followed by the reason.");
          }}
        />
      </details>
      {error && <div className="error">{error}</div>}
      <Link className="primary wide" href="/">
        Back to worklist
      </Link>
      <AppNav active="cases" />
    </main>
  );
}
