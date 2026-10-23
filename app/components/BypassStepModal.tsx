"use client";

import type { ReactNode } from "react";
import { useActions } from "@/app/components/ActionProvider";

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
  const actions = useActions();
  return (
    <>
      <div className="bypass-row">
        <button
          data-action="set_bypass_mode"
          onClick={() => void actions.run("set_bypass_mode", { mode: "skip" })}
        >
          Skip {step}
        </button>
        <button
          data-action="set_bypass_mode"
          onClick={() => void actions.run("set_bypass_mode", { mode: "force" })}
        >
          Force complete
        </button>
      </div>
      {mode && (
        <div className="modal">
          <div className="modal-card">
            <button
              className="close"
              data-action="set_bypass_mode"
              onClick={() =>
                void actions.run("set_bypass_mode", { mode: null })
              }
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
                data-action="set_bypass_reason"
                value={reason}
                onChange={(event) =>
                  void actions.run("set_bypass_reason", {
                    reason: event.target.value,
                  })
                }
                placeholder="Why is this step being bypassed?"
              />
            </label>
            {voiceControl}
            <button
              className="primary"
              data-action="bypass_step"
              disabled={busy || reason.trim().length < 3}
              onClick={() => void actions.run("bypass_step")}
            >
              Confirm {mode}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
