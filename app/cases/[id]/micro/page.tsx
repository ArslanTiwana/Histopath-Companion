"use client";
import Link from "@/app/components/ActionLink";
import { useEffect, useState } from "react";
import { z } from "zod";
import HelpPanel from "@/app/components/HelpPanel";
import AppNav from "@/app/components/AppNav";
import { LoadingState } from "@/app/components/ScreenState";
import BypassStepModal from "@/app/components/BypassStepModal";
import DictationButton from "@/app/components/DictationButton";
import { useRegisterActions } from "@/app/components/ActionProvider";
import { defineAction, type AnyAction } from "@/lib/actions";
import { apiFetch } from "@/lib/api-fetch";
import { runConfirmedAction } from "@/lib/client-actions";
type CaseData = {
  id: number;
  caseLabel: string;
  specimenType: string | null;
  status: string;
};
export default function MicroPage({ params }: { params: { id: string } }) {
  const [item, setItem] = useState<CaseData | null>(null);
  const [dictation, setDictation] = useState("");
  const [provisionalDx, setProvisionalDx] = useState("");
  const [notes, setNotes] = useState("");
  const [differential, setDifferential] = useState<string[]>([]);
  const [ihc, setIhc] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [error, setError] = useState("");
  const [bypass, setBypass] = useState<"skip" | "force" | null>(null);
  const [reason, setReason] = useState("");
  useEffect(() => {
    apiFetch<CaseData>(`/api/cases/${params.id}/micro`).then(setItem);
  }, [params.id]);
  function handleVoice(spokenValue: string) {
    const spoken = spokenValue.trim();
    const skip = spoken.match(
      /^skip (?:micro|microscopy)(?: because)?\s+(.+)/i,
    );
    const force = spoken.match(
      /^force (?:complete )?(?:micro|microscopy)(?: because)?\s+(.+)/i,
    );
    if (skip) {
      setBypass("skip");
      setReason(skip[1]);
    } else if (force) {
      setBypass("force");
      setReason(force[1]);
    } else if (/^(confirm|yes)$/i.test(spoken) && bypass)
      void submitBypass("voice");
    else if (/^(cancel|no)$/i.test(spoken) && bypass) {
      setBypass(null);
      setReason("");
    } else if (/^(save|confirm|confirm and save)$/i.test(spoken) && review)
      void save(false, "voice");
    else setDictation((current) => (current ? `${current} ${spoken}` : spoken));
  }
  async function suggest() {
    if (dictation.trim().length < 3) return;
    setBusy(true);
    setError("");
    try {
      const result = await apiFetch<{
        differential?: string[];
        ihc?: string[];
        error?: string;
      }>(`/api/cases/${params.id}/micro/suggest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ findings: dictation }),
      });
      setDifferential(result.differential || []);
      setIhc(result.ihc || []);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Suggestions unavailable",
      );
    } finally {
      setBusy(false);
    }
  }
  async function save(
    sendToConsultant = false,
    source: "tap" | "voice" = "tap",
  ) {
    setBusy(true);
    setError("");
    try {
      await runConfirmedAction("save_micro", {
        caseId: Number(params.id),
        dictation,
        differential,
        ihc,
        provisionalDx,
        notes,
        sendToConsultant,
        source,
      });
      window.location.href = `/cases/${params.id}`;
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save microscopy",
      );
      setBusy(false);
    }
  }
  async function submitBypass(source: "tap" | "voice" = "tap") {
    if (!bypass || reason.trim().length < 3) {
      setError("A reason is required.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await runConfirmedAction("bypass_step", {
        caseId: Number(params.id),
        step: "micro",
        mode: bypass,
        reason,
        source,
      });
      window.location.href = `/cases/${params.id}`;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not continue");
      setBusy(false);
    }
  }
  const screenActions: AnyAction[] = [
    defineAction({
      id: "set_micro_findings",
      description: "Set or append microscopy findings.",
      args: z.object({
        value: z.string(),
        append: z.boolean().default(false),
      }),
      screens: ["micro"],
      risk: "safe",
      describe: ({ value }) => `Set microscopy findings to ${value}`,
      run: ({ value, append }) =>
        setDictation((current) =>
          append && current ? `${current} ${value}` : value,
        ),
    }),
    defineAction({
      id: "set_provisional_diagnosis",
      description: "Set the provisional diagnosis.",
      args: z.object({ value: z.string() }),
      screens: ["micro"],
      risk: "safe",
      describe: ({ value }) => `Set provisional diagnosis to ${value}`,
      run: ({ value }) => setProvisionalDx(value),
    }),
    defineAction({
      id: "generate_suggestions",
      description: "Generate study suggestions from current findings.",
      args: z.object({}),
      screens: ["micro"],
      risk: "safe",
      describe: () => "Generate microscopy suggestions",
      run: suggest,
    }),
    defineAction({
      id: "ignore_suggestions",
      description: "Clear the generated suggestions.",
      args: z.object({}),
      screens: ["micro"],
      risk: "safe",
      describe: () => "Ignore suggestions",
      run: () => {
        setDifferential([]);
        setIhc([]);
      },
    }),
    defineAction({
      id: "enter_micro_review",
      description: "Open and speak the microscopy read-back.",
      args: z.object({}),
      screens: ["micro"],
      risk: "safe",
      describe: () => "Review microscopy",
      run: () => {
        setReview(true);
        window.speechSynthesis?.speak(
          new SpeechSynthesisUtterance(
            `Findings. ${dictation}. Provisional diagnosis. ${provisionalDx || "Not set"}`,
          ),
        );
      },
    }),
    defineAction({
      id: "read_aloud",
      description: "Read current microscopy content aloud.",
      args: z.object({}),
      screens: ["micro"],
      risk: "safe",
      describe: () => "Read microscopy aloud",
      run: () =>
        window.speechSynthesis?.speak(
          new SpeechSynthesisUtterance(
            `Findings. ${dictation}. Provisional diagnosis. ${provisionalDx || "Not set"}`,
          ),
        ),
    }),
    defineAction({
      id: "edit_micro",
      description: "Return to microscopy editing.",
      args: z.object({}),
      screens: ["micro"],
      risk: "safe",
      describe: () => "Edit microscopy",
      run: () => setReview(false),
    }),
    defineAction({
      id: "open_help",
      description: "Open microscopy study help.",
      args: z.object({}),
      screens: ["micro"],
      risk: "safe",
      describe: () => "Open microscopy help",
      run: () => setHelpOpen(true),
    }),
    defineAction({
      id: "save_micro",
      description: "Save microscopy, optionally sending to consultant.",
      args: z.object({ sendToConsultant: z.boolean().default(false) }),
      screens: ["micro"],
      risk: "confirm",
      describe: ({ sendToConsultant }) =>
        `Save microscopy${sendToConsultant ? " and send to consultant" : ""}`,
      run: ({ sendToConsultant }, ctx) => save(sendToConsultant, ctx.source),
    }),
    defineAction({
      id: "set_bypass_mode",
      description: "Open or close microscopy bypass.",
      args: z.object({ mode: z.enum(["skip", "force"]).nullable() }),
      screens: ["micro"],
      risk: "safe",
      describe: ({ mode: value }) =>
        value ? `${value} microscopy` : "Close bypass",
      run: ({ mode: value }) => {
        setBypass(value);
        if (!value) setReason("");
      },
    }),
    defineAction({
      id: "set_bypass_reason",
      description: "Set the microscopy bypass reason.",
      args: z.object({ reason: z.string() }),
      screens: ["micro"],
      risk: "safe",
      describe: () => "Set bypass reason",
      run: ({ reason: value }) => setReason(value),
    }),
    defineAction({
      id: "bypass_step",
      description: "Skip or force microscopy with a logged reason.",
      args: z.object({}),
      screens: ["micro"],
      risk: "confirm",
      describe: () => `${bypass} microscopy because ${reason}`,
      run: (_args, ctx) => submitBypass(ctx.source),
    }),
  ];
  const actions = useRegisterActions("micro", screenActions, () => ({
    screenId: "micro",
    caseLabel: item?.caseLabel,
    findings: dictation,
    provisionalDx,
    dictationTarget: bypass ? "bypass_reason" : "micro_findings",
    suggestions: { differential, ihc },
    mode: review ? "review" : "entry",
    modal: helpOpen ? "help" : bypass ? `bypass_${bypass}` : null,
  }));
  if (!item)
    return (
      <main className="app-shell">
        <LoadingState label="Loading microscopy" />
      </main>
    );
  if (item.status !== "micro_pending")
    return (
      <main className="app-shell">
        <Link
          data-action="navigate"
          onClick={(event) => {
            event.preventDefault();
            void actions.run("navigate", { to: `/cases/${params.id}` });
          }}
          href={`/cases/${params.id}`}
          className="back"
        >
          ← Case
        </Link>
        <div className="detail-card">
          <h1>Microscopy is not pending</h1>
          <p>This case is currently {item.status.replaceAll("_", " ")}.</p>
        </div>
        <AppNav active="cases" />
      </main>
    );
  return (
    <main className="app-shell micro-shell">
      <Link
        data-action="navigate"
        onClick={(event) => {
          event.preventDefault();
          void actions.run("navigate", { to: `/cases/${params.id}` });
        }}
        href={`/cases/${params.id}`}
        className="back"
      >
        ← {item.caseLabel}
      </Link>
      <header>
        <div>
          <div className="eyebrow">
            {item.specimenType || "Specimen"} · Step 3 of 6
          </div>
          <h1>{review ? "Read-back" : `Microscopy · ${item.caseLabel}`}</h1>
        </div>
      </header>
      <button
        data-action="open_help"
        className="help-button"
        onClick={() => void actions.run("open_help")}
      >
        ✦ Ask for help
      </button>
      {notes && (
        <div className="added-note">
          <b>Added from help:</b> {notes}
        </div>
      )}
      {review ? (
        <div className="detail-card readback">
          <h3>Findings</h3>
          <p>{dictation}</p>
          <h3>Provisional diagnosis</h3>
          <p>{provisionalDx || "Not set"}</p>
          <button
            className="secondary wide"
            data-action="read_aloud"
            onClick={() => void actions.run("read_aloud")}
          >
            🔊 Read aloud
          </button>
          <div className="gross-actions">
            <button
              data-action="edit_micro"
              className="secondary"
              onClick={() => void actions.run("edit_micro")}
            >
              Edit
            </button>
            <button
              className="primary"
              data-action="save_micro"
              disabled={busy}
              onClick={() =>
                void actions.run("save_micro", { sendToConsultant: false })
              }
            >
              Confirm and save
            </button>
          </div>
          <button
            className="secondary wide"
            data-action="save_micro"
            disabled={busy}
            onClick={() =>
              void actions.run("save_micro", { sendToConsultant: true })
            }
          >
            Confirm, save and send to consultant
          </button>
          <DictationButton
            label="Say confirm and save"
            onTranscript={() =>
              void actions.run(
                "save_micro",
                { sendToConsultant: false },
                { source: "voice" },
              )
            }
          />
        </div>
      ) : (
        <>
          <div className="detail-card">
            <label className="field-label">
              Microscopy findings
              <textarea
                data-action="set_micro_findings"
                value={dictation}
                onChange={(event) =>
                  void actions.run("set_micro_findings", {
                    value: event.target.value,
                  })
                }
                placeholder="Describe the microscopic findings…"
              />
            </label>
            <DictationButton
              label="Add dictation"
              onTranscript={(value) =>
                void actions.run(
                  "set_micro_findings",
                  { value, append: true },
                  { source: "voice" },
                )
              }
            />
            <button
              className="secondary wide"
              data-action="generate_suggestions"
              disabled={busy || dictation.trim().length < 3}
              onClick={() => void actions.run("generate_suggestions")}
            >
              Generate study suggestions
            </button>
          </div>
          {(differential.length > 0 || ihc.length > 0) && (
            <div className="suggestion-grid">
              <section className="detail-card">
                <h3>Suggested differential</h3>
                {differential.length ? (
                  <ul>
                    {differential.map((value) => (
                      <li key={value}>{value}</li>
                    ))}
                  </ul>
                ) : (
                  <p>None suggested.</p>
                )}
              </section>
              <section className="detail-card">
                <h3>Suggested IHC</h3>
                {ihc.length ? (
                  <ul>
                    {ihc.map((value) => (
                      <li key={value}>{value}</li>
                    ))}
                  </ul>
                ) : (
                  <p>Not indicated.</p>
                )}
              </section>
              <p className="study-aid">
                Suggestions are study aids. You decide.
              </p>
              <button
                className="secondary"
                data-action="ignore_suggestions"
                onClick={() => void actions.run("ignore_suggestions")}
              >
                Ignore suggestions
              </button>
            </div>
          )}
          <div className="detail-card">
            <label className="field-label">
              Your provisional diagnosis
              <input
                data-action="set_provisional_diagnosis"
                value={provisionalDx}
                onChange={(event) =>
                  void actions.run("set_provisional_diagnosis", {
                    value: event.target.value,
                  })
                }
                placeholder="Optional provisional diagnosis"
              />
            </label>
            <button
              className="primary wide"
              data-action="enter_micro_review"
              disabled={dictation.trim().length < 3}
              onClick={() => void actions.run("enter_micro_review")}
            >
              Read back and save
            </button>
          </div>
        </>
      )}
      <BypassStepModal
        step="micro"
        mode={bypass}
        reason={reason}
        busy={busy}
        onModeChange={setBypass}
        onReasonChange={setReason}
        onConfirm={() => void submitBypass("tap")}
        voiceControl={
          <DictationButton
            label="Say confirm or cancel"
            onTranscript={handleVoice}
          />
        }
      />
      {error && <div className="error">{error}</div>}
      {helpOpen && (
        <HelpPanel
          caseId={params.id}
          caseLabel={item.caseLabel}
          contextStep="micro"
          currentText={`${dictation}\nDifferential: ${differential.join(", ") || "not set"}`}
          onAddNote={(note) =>
            setNotes((current) => (current ? `${current}\n${note}` : note))
          }
          onClose={() => setHelpOpen(false)}
        />
      )}
      <AppNav active="cases" />
    </main>
  );
}
