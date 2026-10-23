"use client";

import Link from "@/app/components/ActionLink";
import { useEffect, useState } from "react";
import { z } from "zod";
import AppNav from "@/app/components/AppNav";
import { LoadingState } from "@/app/components/ScreenState";
import DictationButton from "@/app/components/DictationButton";
import { apiFetch } from "@/lib/api-fetch";
import { runConfirmedAction } from "@/lib/client-actions";
import { useRegisterActions } from "@/app/components/ActionProvider";
import { defineAction, type AnyAction } from "@/lib/actions";

type Fields = {
  diagnosis: string;
  grade: string;
  pT: string;
  pN: string;
  margins: string;
  laterality: string;
  tumourSize: string;
};
type Row = {
  field: string;
  label: string;
  resident: string;
  consultant: string;
  matches: boolean;
  hint?: string;
};
type Data = {
  id: number;
  caseLabel: string;
  specimenType: string | null;
  status: string;
  microEntry?: { provisionalDx: string | null } | null;
  consultantEntry?: {
    consultantDx: Fields;
    comparison: Row[];
    learnedNote: string | null;
  } | null;
};
const empty: Fields = {
  diagnosis: "",
  grade: "",
  pT: "",
  pN: "",
  margins: "",
  laterality: "",
  tumourSize: "",
};
const inputs: [keyof Fields, string][] = [
  ["diagnosis", "Diagnosis"],
  ["grade", "Grade"],
  ["pT", "pT stage"],
  ["pN", "pN stage"],
  ["margins", "Margins"],
  ["laterality", "Laterality"],
  ["tumourSize", "Tumour size"],
];

export default function ConsultantPage({ params }: { params: { id: string } }) {
  const [item, setItem] = useState<Data | null>(null);
  const [fields, setFields] = useState<Fields>(empty);
  const [learnedNote, setLearnedNote] = useState("");
  const [review, setReview] = useState(false);
  const [comparison, setComparison] = useState<Row[]>([]);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    apiFetch<Data>(`/api/cases/${params.id}/consultant`).then((data: Data) => {
      setItem(data);
      if (data.consultantEntry) {
        setFields(data.consultantEntry.consultantDx);
        setComparison(data.consultantEntry.comparison);
        setLearnedNote(data.consultantEntry.learnedNote || "");
        setSaved(true);
        setReview(true);
      }
    });
  }, [params.id]);
  async function applyDictation(text: string) {
    const parsed = await apiFetch<
      Fields & { histology: string; learnedNote: string }
    >("/api/voice/consultant-parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    setFields((current) => ({
      ...current,
      diagnosis: parsed.histology,
      grade: parsed.grade,
      pT: parsed.pT,
      pN: parsed.pN,
      margins: parsed.margins,
      laterality: parsed.laterality,
      tumourSize: parsed.tumourSize,
    }));
    if (parsed.learnedNote) setLearnedNote(parsed.learnedNote);
  }
  async function save(source: "tap" | "voice" = "tap") {
    setBusy(true);
    setError("");
    try {
      const response = await runConfirmedAction<{
        comparison: Row[];
      }>("save_consultant", {
        caseId: Number(params.id),
        consultantDx: fields,
        learnedNote,
        source,
      });
      setComparison(response.result.comparison || []);
      setSaved(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not save consultant review",
      );
    } finally {
      setBusy(false);
    }
  }
  async function generate(source: "tap" | "voice" = "tap") {
    setBusy(true);
    setError("");
    try {
      await runConfirmedAction("generate_report", {
        caseId: Number(params.id),
        source,
      });
    } catch (cause) {
      setBusy(false);
      return setError(
        cause instanceof Error ? cause.message : "Could not generate report",
      );
    }
    window.location.href = `/cases/${params.id}/report`;
  }
  const screenActions: AnyAction[] = [
    defineAction({
      id: "set_consultant_field",
      description: "Set a consultant diagnosis field or learned note.",
      args: z.object({
        field: z.enum([
          "diagnosis",
          "grade",
          "pT",
          "pN",
          "margins",
          "laterality",
          "tumourSize",
          "learnedNote",
        ]),
        value: z.string(),
      }),
      screens: ["consultant"],
      risk: "safe",
      describe: ({ field, value }) => `Set ${field} to ${value}`,
      run: ({ field, value }) =>
        field === "learnedNote"
          ? setLearnedNote(value)
          : setFields((current) => ({ ...current, [field]: value })),
    }),
    defineAction({
      id: "dictate_consultant",
      description: "Parse consultant fields from dictation.",
      args: z.object({ text: z.string() }),
      screens: ["consultant"],
      risk: "safe",
      describe: () => "Dictate consultant diagnosis",
      run: ({ text }) => applyDictation(text),
    }),
    defineAction({
      id: "enter_consultant_review",
      description: "Open and speak the consultant comparison.",
      args: z.object({}),
      screens: ["consultant"],
      risk: "safe",
      describe: () => "Review consultant diagnosis",
      run: () => {
        setReview(true);
        window.speechSynthesis?.speak(
          new SpeechSynthesisUtterance(
            inputs
              .map(
                ([key, label]) => `${label}. ${fields[key] || "Not recorded"}`,
              )
              .join(". "),
          ),
        );
      },
    }),
    defineAction({
      id: "edit_consultant",
      description: "Return to consultant editing.",
      args: z.object({}),
      screens: ["consultant"],
      risk: "safe",
      describe: () => "Edit consultant fields",
      run: () => setReview(false),
    }),
    defineAction({
      id: "save_consultant",
      description: "Save consultant diagnosis and comparison.",
      args: z.object({}),
      screens: ["consultant"],
      risk: "confirm",
      describe: () => "Save consultant diagnosis",
      run: (_args, ctx) => save(ctx.source),
    }),
    defineAction({
      id: "generate_report",
      description: "Generate the report from saved consultant findings.",
      args: z.object({}),
      screens: ["consultant"],
      risk: "confirm",
      describe: () => "Generate report",
      run: (_args, ctx) => generate(ctx.source),
    }),
  ];
  const actions = useRegisterActions("consultant", screenActions, () => ({
    screenId: "consultant",
    caseLabel: item?.caseLabel,
    fields,
    learnedNote,
    dictationTarget: "consultant_dictation",
    mode: review ? "comparison" : "entry",
    saved,
  }));
  if (!item)
    return (
      <main className="app-shell">
        <LoadingState label="Loading consultant comparison" />
      </main>
    );
  const rows: Row[] = comparison.length
    ? comparison
    : inputs.map(([field, label]) => ({
        field,
        label,
        resident:
          field === "diagnosis"
            ? item.microEntry?.provisionalDx || "Not recorded"
            : "Not recorded",
        consultant: fields[field] || "Not recorded",
        matches: false,
      }));
  return (
    <main className="app-shell">
      <Link
        data-action="navigate"
        href={`/cases/${params.id}`}
        className="back"
      >
        ← Case
      </Link>
      <header>
        <div>
          <div className="eyebrow">{item.specimenType || "Specimen"}</div>
          <h1>Consultant review · {item.caseLabel}</h1>
        </div>
        {review && (
          <span className="status-pill">
            {rows.filter((row) => !row.matches).length} differences
          </span>
        )}
      </header>
      {!review ? (
        <>
          <section className="detail-card form-stack">
            {inputs.map(([key, label]) => (
              <label className="field-label" key={key}>
                {label}
                <input
                  data-action="set_consultant_field"
                  value={fields[key]}
                  onChange={(event) =>
                    void actions.run("set_consultant_field", {
                      field: key,
                      value: event.target.value,
                    })
                  }
                />
              </label>
            ))}
            <label className="field-label">
              Learned note
              <textarea
                data-action="set_consultant_field"
                value={learnedNote}
                onChange={(event) =>
                  void actions.run("set_consultant_field", {
                    field: "learnedNote",
                    value: event.target.value,
                  })
                }
                placeholder="What changed and what will you check next time?"
              />
            </label>
          </section>
          <DictationButton
            label="Dictate consultant diagnosis"
            onTranscript={(text) =>
              void actions.run(
                "dictate_consultant",
                { text },
                { source: "voice" },
              )
            }
          />
          <button
            className="primary wide"
            data-action="enter_consultant_review"
            disabled={!fields.diagnosis.trim()}
            onClick={() => void actions.run("enter_consultant_review")}
          >
            Read back and compare
          </button>
        </>
      ) : (
        <>
          {rows.some((row) => !row.matches) && (
            <div className="learned-banner">
              Saved to Learned from after confirmation
            </div>
          )}
          <div className="comparison-table">
            <div className="comparison-head">
              <b>Parameter</b>
              <b>My diagnosis</b>
              <b>Consultant</b>
            </div>
            {rows.map((row) => (
              <div
                className={
                  row.matches
                    ? "comparison-row match"
                    : "comparison-row difference"
                }
                key={row.field}
              >
                <b>{row.label}</b>
                <span>{row.resident}</span>
                <span>
                  {row.consultant} {row.matches ? "✓" : "✕"}
                </span>
                {row.hint && <small>{row.hint}</small>}
              </div>
            ))}
          </div>
          {learnedNote && (
            <section className="detail-card">
              <h3>Learned from this case</h3>
              <p>{learnedNote}</p>
            </section>
          )}
          {!saved ? (
            <div className="gross-actions">
              <button
                data-action="edit_consultant"
                className="secondary"
                onClick={() => void actions.run("edit_consultant")}
              >
                Edit
              </button>
              <button
                className="primary"
                data-action="save_consultant"
                disabled={busy}
                onClick={() => void actions.run("save_consultant")}
              >
                Confirm and save
              </button>
            </div>
          ) : (
            <>
              <button
                className="primary wide"
                data-action="generate_report"
                disabled={busy}
                onClick={() => void actions.run("generate_report")}
              >
                Generate report
              </button>
              <DictationButton
                label="Say generate report"
                onTranscript={(text) =>
                  /generate report/i.test(text)
                    ? void actions.run(
                        "generate_report",
                        {},
                        { source: "voice" },
                      )
                    : setError("Say generate report to continue.")
                }
              />
            </>
          )}
        </>
      )}
      {error && <div className="error">{error}</div>}
      <AppNav active="cases" />
    </main>
  );
}
