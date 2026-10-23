"use client";

import type { ReactNode } from "react";

type Mode = "skip" | "force";

export default function BypassStepModal({
  step,
  mode,
  reason,
  busy,
  onModeChange,
  onReasonChange,
  onConfirm,
  voiceControl,
}: {
  step: "gross" | "micro" | "consultant" | "report" | "typist";
  mode: Mode | null;
  reason: string;
  busy: boolean;
  onModeChange: (mode: Mode | null) => void;
  onReasonChange: (reason: string) => void;
  onConfirm: () => void;
  voiceControl?: ReactNode;
}) {
  return (
    <>
      <div className="bypass-row">
        <button onClick={() => onModeChange("skip")}>Skip {step}</button>
        <button onClick={() => onModeChange("force")}>Force complete</button>
      </div>
      {mode && (
        <div className="modal">
          <div className="modal-card">
            <button
              className="close"
              onClick={() => {
                onModeChange(null);
                onReasonChange("");
              }}
            >
              ×
            </button>
            <div className="eyebrow">INCOMPLETE WILL BE LOGGED</div>
            <h2>
              {mode === "skip" ? `Skip ${step}?` : `Force complete ${step}?`}
            </h2>
            <label>
              Reason required
              <textarea
                value={reason}
                onChange={(event) => onReasonChange(event.target.value)}
                placeholder="Why is this step being bypassed?"
              />
            </label>
            {voiceControl}
            <button
              className="primary"
              disabled={busy || reason.trim().length < 3}
              onClick={onConfirm}
            >
              Confirm {mode}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
