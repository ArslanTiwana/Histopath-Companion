"use client";

import Link from "@/app/components/ActionLink";
import { useEffect, useState } from "react";
import { z } from "zod";
import AppNav from "@/app/components/AppNav";
import DictationButton from "@/app/components/DictationButton";
import { apiFetch } from "@/lib/api-fetch";
import { runConfirmedAction } from "@/lib/client-actions";
import { useRegisterActions } from "@/app/components/ActionProvider";
import { defineAction, type AnyAction } from "@/lib/actions";

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
  const [unlockOpen, setUnlockOpen] = useState(false);
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
  const screenActions: AnyAction[] = [
    defineAction({
      id: "open_unlock",
      description: "Open or close the unlock controls.",
      args: z.object({ open: z.boolean().optional() }),
      screens: ["delivered"],
      risk: "safe",
      describe: () => "Open unlock controls",
      run: ({ open }) => setUnlockOpen((current) => open ?? !current),
    }),
    defineAction({
      id: "set_unlock_reason",
      description: "Set the logged unlock reason.",
      args: z.object({ reason: z.string() }),
      screens: ["delivered"],
      risk: "safe",
      describe: ({ reason: value }) => `Set unlock reason to ${value}`,
      run: ({ reason: value }) => setReason(value),
    }),
    defineAction({
      id: "unlock_case",
      description: "Unlock this delivered case with a reason.",
      args: z.object({ reason: z.string().optional() }),
      screens: ["delivered"],
      risk: "confirm",
      describe: ({ reason: value }) => `Unlock because ${value || reason}`,
      run: ({ reason: value }, ctx) => unlock(ctx.source, value || reason),
    }),
  ];
  const actions = useRegisterActions("delivered", screenActions, () => ({
    screenId: "delivered",
    caseLabel: item?.caseLabel,
    locked: item?.locked,
    reason,
    modal: unlockOpen ? "unlock" : null,
  }));
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
      <details className="override-box" open={unlockOpen}>
        <summary
          data-action="open_unlock"
          onClick={(event) => {
            event.preventDefault();
            void actions.run("open_unlock");
          }}
        >
          Unlock with a reason
        </summary>
        <textarea
          data-action="set_unlock_reason"
          value={reason}
          onChange={(event) =>
            void actions.run("set_unlock_reason", {
              reason: event.target.value,
            })
          }
          placeholder="Reason required"
        />
        <button
          className="primary wide"
          data-action="unlock_case"
          disabled={busy || reason.trim().length < 3}
          onClick={() => void actions.run("unlock_case", { reason })}
        >
          Confirm unlock
        </button>
        <DictationButton
          label="Say unlock because…"
          onTranscript={(text) => {
            const spoken = text.match(/^unlock(?: case)? because\s+(.+)/i)?.[1];
            if (spoken)
              void actions.run(
                "unlock_case",
                { reason: spoken },
                { source: "voice" },
              );
            else setError("Say unlock because, followed by the reason.");
          }}
        />
      </details>
      {error && <div className="error">{error}</div>}
      <Link data-action="navigate" className="primary wide" href="/">
        Back to worklist
      </Link>
      <AppNav active="cases" />
    </main>
  );
}
