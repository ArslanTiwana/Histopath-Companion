"use client";
import Link from "@/app/components/ActionLink";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import {
  GROSS_TEMPLATES,
  SPECIMEN_TYPES,
  type GrossTemplate,
} from "@/src/lib/gross/templates";
import HelpPanel from "@/app/components/HelpPanel";
import AppNav from "@/app/components/AppNav";
import { LoadingState } from "@/app/components/ScreenState";
import BypassStepModal from "@/app/components/BypassStepModal";
import DictationButton from "@/app/components/DictationButton";
import { useRegisterActions } from "@/app/components/ActionProvider";
import { defineAction, type AnyAction } from "@/lib/actions";
import { apiFetch } from "@/lib/api-fetch";
import { runConfirmedAction } from "@/lib/client-actions";
import { specimenName } from "@/lib/specimens";
import {
  previousGrossForSpecimen,
  type PreviousGross,
} from "@/lib/gross-selection";

type GrossData = {
  case: {
    id: number;
    caseLabel: string;
    specimenType: string | null;
    status: string;
  };
  previous: PreviousGross[];
};
export default function GrossPage({ params }: { params: { id: string } }) {
  const [data, setData] = useState<GrossData | null>(null);
  const [specimen, setSpecimen] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [index, setIndex] = useState(0);
  const [mode, setMode] = useState<"guide" | "review">("guide");
  const [bypass, setBypass] = useState<"skip" | "force" | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [managedTemplates, setManagedTemplates] = useState<
    Record<string, GrossTemplate>
  >({});
  useEffect(() => {
    apiFetch<GrossData>(`/api/cases/${params.id}/gross`).then(
      (value: GrossData) => {
        setData(value);
        setSpecimen(value.case.specimenType || "");
      },
    );
    apiFetch<
      {
        kind: string;
        specimenType: string;
        schema: unknown;
        defaultText: string | null;
      }[]
    >("/api/templates").then(
      (
        templates: {
          kind: string;
          specimenType: string;
          schema: unknown;
          defaultText: string | null;
        }[],
      ) => {
        const managed: Record<string, GrossTemplate> = {};
        for (const item of templates) {
          if (
            item.kind !== "gross" ||
            typeof item.schema !== "object" ||
            !item.schema
          )
            continue;
          const value = item.schema as Partial<GrossTemplate>;
          if (Array.isArray(value.fields) && value.fields.length)
            managed[item.specimenType] = {
              name: value.name || item.specimenType,
              fields: value.fields,
              defaultText: item.defaultText || undefined,
            };
        }
        setManagedTemplates(managed);
      },
    );
  }, [params.id]);
  const template = specimen
    ? managedTemplates[specimen] ||
      GROSS_TEMPLATES[specimen] ||
      GROSS_TEMPLATES.other
    : null;
  const description = useMemo(() => {
    if (!specimen || !template) return "";
    const details = template.fields
      .filter((field) => fields[field.key]?.trim())
      .map((field) => `${field.label}: ${fields[field.key].trim()}`);
    const seeded = template.defaultText?.trim();
    return `${seeded ? `${seeded} ` : `${specimen} specimen. `}${details.join(". ")}${details.length ? "." : ""}`;
  }, [specimen, fields, template]);
  const specimenTypes = Array.from(
    new Set([...SPECIMEN_TYPES, ...Object.keys(managedTemplates)]),
  );
  const completed =
    template?.fields.filter((field) => fields[field.key]?.trim()).length || 0;
  function answer(value: string) {
    if (!template) return;
    setFields((current) => ({
      ...current,
      [template.fields[index].key]: value,
    }));
    if (index < template.fields.length - 1) setIndex(index + 1);
  }
  function handleVoice(value: string) {
    const spoken = value.trim();
    const lower = spoken.toLowerCase();
    if (!specimen) {
      const matched = SPECIMEN_TYPES.find((type) =>
        lower.includes(type.toLowerCase()),
      );
      if (matched) setSpecimen(matched);
      else
        setError(
          "I didn't recognize that specimen. Please say or tap a listed type.",
        );
      return;
    }
    const skip = lower.match(/^skip (?:gross|grossing)(?: because)?\s+(.+)/);
    const force = lower.match(
      /^force (?:complete )?(?:gross|grossing)(?: because)?\s+(.+)/,
    );
    if (skip) {
      setBypass("skip");
      setReason(skip[1]);
      return;
    }
    if (force) {
      setBypass("force");
      setReason(force[1]);
      return;
    }
    if (/^(read back|review)$/.test(lower)) {
      setMode("review");
      window.speechSynthesis?.speak(new SpeechSynthesisUtterance(description));
      return;
    }
    if (
      /^(confirm|save|confirm and save)$/.test(lower) &&
      mode === "review" &&
      !bypass
    ) {
      void submitSave("voice");
      return;
    }
    if (/^(confirm|yes)$/.test(lower) && bypass) {
      void submitBypass("voice");
      return;
    }
    if (/^(cancel|no)$/.test(lower) && bypass) {
      setBypass(null);
      setReason("");
      return;
    }
    answer(spoken);
  }
  function copyPrevious() {
    const previous = data
      ? previousGrossForSpecimen(data.previous, specimen)
      : null;
    if (!previous) return;
    setFields(previous.fields);
    setIndex(0);
  }
  async function submitSave(source: "tap" | "voice" = "tap") {
    setBusy(true);
    setError("");
    try {
      await runConfirmedAction("save_gross", {
        caseId: Number(params.id),
        action: "save",
        specimenType: specimen,
        fields,
        descriptionText: description,
        transcript: Object.values(fields).join(". "),
        notes,
        source,
      });
      window.speechSynthesis?.speak(
        new SpeechSynthesisUtterance(
          "Gross saved. Moving to microscopy pending.",
        ),
      );
      window.location.href = `/cases/${params.id}`;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save gross");
      setBusy(false);
    }
  }
  async function submitBypass(source: "tap" | "voice" = "tap") {
    if (!bypass || reason.trim().length < 3) {
      setError("A reason is required.");
      return;
    }
    setBusy(true);
    try {
      await runConfirmedAction("bypass_step", {
        caseId: Number(params.id),
        step: "gross",
        mode: bypass,
        reason,
        source,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not continue");
      setBusy(false);
      return;
    }
    window.location.href = `/cases/${params.id}`;
  }
  const screenActions: AnyAction[] = [
    defineAction({
      id: "set_specimen",
      description: "Select a specimen template by slug or name.",
      args: z.object({ specimen: z.string() }),
      screens: ["gross"],
      risk: "safe",
      describe: ({ specimen: value }) => `Use ${value}`,
      run: ({ specimen: value }) => {
        const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        const match = specimenTypes.find(
          (type) => type.toLowerCase().replace(/[^a-z0-9]+/g, "-") === slug,
        );
        if (!match) throw new Error("That specimen template is not available.");
        setSpecimen(match);
      },
    }),
    defineAction({
      id: "same_as_previous",
      description: "Copy the latest gross from the same specimen type.",
      args: z.object({}),
      screens: ["gross"],
      risk: "safe",
      describe: () => "Use the previous matching gross",
      run: copyPrevious,
    }),
    defineAction({
      id: "answer_gross_question",
      description: "Answer the current gross checklist question.",
      args: z.object({
        value: z.string(),
        advance: z.boolean().default(false),
      }),
      screens: ["gross"],
      risk: "safe",
      describe: ({ value }) => `Answer ${value}`,
      run: ({ value, advance }) =>
        advance
          ? answer(value)
          : setFields((current) => ({
              ...current,
              [template!.fields[index].key]: value,
            })),
    }),
    defineAction({
      id: "next_gross_field",
      description: "Move to the next gross field or review.",
      args: z.object({}),
      screens: ["gross"],
      risk: "safe",
      describe: () => "Next gross field",
      run: () =>
        index < (template?.fields.length || 1) - 1
          ? setIndex(index + 1)
          : setMode("review"),
    }),
    defineAction({
      id: "previous_gross_field",
      description: "Move to the previous gross field.",
      args: z.object({}),
      screens: ["gross"],
      risk: "safe",
      describe: () => "Previous gross field",
      run: () => setIndex(Math.max(0, index - 1)),
    }),
    defineAction({
      id: "select_gross_field",
      description: "Select a gross checklist field by position.",
      args: z.object({ position: z.number().int().min(1) }),
      screens: ["gross"],
      risk: "safe",
      describe: ({ position }) => `Open gross field ${position}`,
      run: ({ position }) =>
        setIndex(Math.min((template?.fields.length || 1) - 1, position - 1)),
    }),
    defineAction({
      id: "edit_gross_answers",
      description: "Return to gross answers.",
      args: z.object({}),
      screens: ["gross"],
      risk: "safe",
      describe: () => "Edit gross answers",
      run: () => setMode("guide"),
    }),
    defineAction({
      id: "enter_gross_review",
      description: "Open and speak the gross read-back.",
      args: z.object({}),
      screens: ["gross"],
      risk: "safe",
      describe: () => "Review gross",
      run: () => {
        setMode("review");
        window.speechSynthesis?.speak(
          new SpeechSynthesisUtterance(description),
        );
      },
    }),
    defineAction({
      id: "read_aloud",
      description: "Read the gross description aloud.",
      args: z.object({}),
      screens: ["gross"],
      risk: "safe",
      describe: () => "Read gross aloud",
      run: () =>
        window.speechSynthesis?.speak(
          new SpeechSynthesisUtterance(description),
        ),
    }),
    defineAction({
      id: "open_help",
      description: "Open gross study help.",
      args: z.object({}),
      screens: ["gross"],
      risk: "safe",
      describe: () => "Open gross help",
      run: () => setHelpOpen(true),
    }),
    defineAction({
      id: "save_gross",
      description: "Save gross and advance to microscopy.",
      args: z.object({}),
      screens: ["gross"],
      risk: "confirm",
      describe: () => `Save gross: ${description}`,
      run: (_args, ctx) => submitSave(ctx.source),
    }),
    defineAction({
      id: "set_bypass_mode",
      description: "Open or close gross bypass.",
      args: z.object({ mode: z.enum(["skip", "force"]).nullable() }),
      screens: ["gross"],
      risk: "safe",
      describe: ({ mode: value }) =>
        value ? `${value} gross` : "Close bypass",
      run: ({ mode: value }) => {
        setBypass(value);
        if (!value) setReason("");
      },
    }),
    defineAction({
      id: "set_bypass_reason",
      description: "Set the gross bypass reason.",
      args: z.object({ reason: z.string() }),
      screens: ["gross"],
      risk: "safe",
      describe: () => "Set bypass reason",
      run: ({ reason: value }) => setReason(value),
    }),
    defineAction({
      id: "bypass_step",
      description: "Skip or force gross with a logged reason.",
      args: z.object({}),
      screens: ["gross"],
      risk: "confirm",
      describe: () => `${bypass} gross because ${reason}`,
      run: (_args, ctx) => submitBypass(ctx.source),
    }),
  ];
  const actions = useRegisterActions("gross", screenActions, () => ({
    screenId: "gross",
    caseLabel: data?.case.caseLabel,
    specimen,
    currentQuestion: template?.fields[index]?.question,
    dictationTarget: bypass
      ? "bypass_reason"
      : template?.fields[index]?.question
        ? "gross_question"
        : null,
    fields,
    mode,
    modal: helpOpen ? "help" : bypass ? `bypass_${bypass}` : null,
  }));
  if (!data)
    return (
      <main className="app-shell">
        <LoadingState label="Loading grossing" />
      </main>
    );
  if (data.case.status !== "gross_pending")
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
          <h1>Gross already completed</h1>
          <p>This case is currently {data.case.status.replaceAll("_", " ")}.</p>
        </div>
        <AppNav active="cases" />
      </main>
    );
  if (!specimen)
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
        <div className="eyebrow">{data.case.caseLabel} · FROM WORKLIST</div>
        <h1>Next case</h1>
        <h3>Specimen type</h3>
        <p className="subtle">
          The matching checklist will load. This is saved only after your final
          confirmation.
        </p>
        <DictationButton
          label="Say specimen type"
          onTranscript={(value) =>
            void actions.run(
              "set_specimen",
              { specimen: value },
              { source: "voice" },
            )
          }
        />
        <div className="specimen-grid">
          {specimenTypes.map((type) => (
            <button
              className="specimen-card"
              data-action="set_specimen"
              key={type}
              onClick={() =>
                void actions.run("set_specimen", { specimen: type })
              }
            >
              {specimenName(type)}
            </button>
          ))}
        </div>
        <AppNav active="cases" />
      </main>
    );
  return (
    <main className="app-shell gross-shell">
      <Link
        data-action="navigate"
        onClick={(event) => {
          event.preventDefault();
          void actions.run("navigate", { to: `/cases/${params.id}` });
        }}
        href={`/cases/${params.id}`}
        className="back"
      >
        ← {data.case.caseLabel}
      </Link>
      <header>
        <div>
          <div className="eyebrow">
            {specimen} · Step {Math.min(index + 1, template!.fields.length)} of{" "}
            {template!.fields.length}
          </div>
          <h1>
            {mode === "review" ? "Read-back" : `Gross · ${data.case.caseLabel}`}
          </h1>
        </div>
        <span className="status-pill">
          {completed}/{template!.fields.length}
        </span>
      </header>
      {notes && (
        <div className="added-note">
          <b>Added from help:</b> {notes}
        </div>
      )}
      <button
        data-action="open_help"
        className="help-button"
        onClick={() => void actions.run("open_help")}
      >
        ✦ Ask for help
      </button>
      {mode === "guide" ? (
        <>
          <div className="gross-progress">
            <span
              style={{
                width: `${(completed / template!.fields.length) * 100}%`,
              }}
            />
          </div>
          <div className="detail-card gross-answer">
            <h2>{template!.fields[index].question}</h2>
            <label>
              {template!.fields[index].label}
              <input
                data-action="answer_gross_question"
                value={fields[template!.fields[index].key] || ""}
                placeholder={template!.fields[index].placeholder}
                onChange={(event) =>
                  void actions.run("answer_gross_question", {
                    value: event.target.value,
                  })
                }
              />
            </label>
            <div className="gross-actions">
              <DictationButton
                label="Answer by voice"
                onTranscript={(value) =>
                  void actions.run(
                    "answer_gross_question",
                    { value, advance: true },
                    { source: "voice" },
                  )
                }
              />
              <button
                className="primary"
                data-action="next_gross_field"
                onClick={() => void actions.run("next_gross_field")}
              >
                {index < template!.fields.length - 1 ? "Next" : "Review"}
              </button>
            </div>
          </div>
          <div className="checklist">
            {template!.fields.map((field, fieldIndex) => (
              <button
                key={field.key}
                data-action="select_gross_field"
                className={
                  fieldIndex === index ? "check-item current" : "check-item"
                }
                onClick={() =>
                  void actions.run("select_gross_field", {
                    position: fieldIndex + 1,
                  })
                }
              >
                <span>{fields[field.key] ? "✓" : "○"}</span>
                <div>
                  <strong>{field.label}</strong>
                  <small>{fields[field.key] || "Not answered"}</small>
                </div>
              </button>
            ))}
          </div>
          <button
            className="secondary wide"
            data-action="enter_gross_review"
            onClick={() => void actions.run("enter_gross_review")}
          >
            Read back and save
          </button>
        </>
      ) : (
        <div className="detail-card readback">
          <p>{description}</p>
          <button
            className="secondary wide"
            data-action="read_aloud"
            onClick={() => void actions.run("read_aloud")}
          >
            🔊 Read aloud
          </button>
          <div className="gross-actions">
            <button
              data-action="edit_gross_answers"
              className="secondary"
              onClick={() => void actions.run("edit_gross_answers")}
            >
              Edit answers
            </button>
            <button
              className="primary"
              data-action="save_gross"
              disabled={busy || completed < template!.fields.length}
              onClick={() => void actions.run("save_gross")}
            >
              Confirm and save
            </button>
          </div>
        </div>
      )}
      {previousGrossForSpecimen(data.previous, specimen) && (
        <button
          data-action="same_as_previous"
          className="secondary wide"
          onClick={() => void actions.run("same_as_previous")}
        >
          Same as{" "}
          {previousGrossForSpecimen(data.previous, specimen)!.case.caseLabel}
        </button>
      )}
      <BypassStepModal
        step="gross"
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
          caseLabel={data.case.caseLabel}
          contextStep="gross"
          currentText={description}
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
