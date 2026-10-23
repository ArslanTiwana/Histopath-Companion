"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppNav from "@/app/components/AppNav";
import DictationButton from "@/app/components/DictationButton";
import { apiFetch } from "@/lib/api-fetch";
import { runConfirmedAction } from "@/lib/client-actions";

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
  function applyDictation(text: string) {
    setFields((current) => ({
      ...current,
      diagnosis: text,
      grade: text.match(/\bG(?:rade)?\s*[1-4]\b/i)?.[0] || current.grade,
      pT: text.match(/\bpT\s*[0-4][a-d]?\b/i)?.[0] || current.pT,
      pN: text.match(/\bpN\s*[0-3][a-c]?\b/i)?.[0] || current.pN,
      laterality:
        text.match(/\b(left|right|bilateral)\b/i)?.[0] || current.laterality,
      tumourSize:
        text.match(/\b\d+(?:\.\d+)?\s*(?:mm|cm)\b/i)?.[0] || current.tumourSize,
    }));
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
  if (!item) return <main className="app-shell">Loading…</main>;
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
      <Link href={`/cases/${params.id}`} className="back">
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
                  value={fields[key]}
                  onChange={(event) =>
                    setFields((current) => ({
                      ...current,
                      [key]: event.target.value,
                    }))
                  }
                />
              </label>
            ))}
            <label className="field-label">
              Learned note
              <textarea
                value={learnedNote}
                onChange={(event) => setLearnedNote(event.target.value)}
                placeholder="What changed and what will you check next time?"
              />
            </label>
          </section>
          <DictationButton
            label="Dictate consultant diagnosis"
            onTranscript={applyDictation}
          />
          <button
            className="primary wide"
            disabled={!fields.diagnosis.trim()}
            onClick={() => {
              setReview(true);
              window.speechSynthesis?.speak(
                new SpeechSynthesisUtterance(
                  inputs
                    .map(
                      ([key, label]) =>
                        `${label}. ${fields[key] || "Not recorded"}`,
                    )
                    .join(". "),
                ),
              );
            }}
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
              <button className="secondary" onClick={() => setReview(false)}>
                Edit
              </button>
              <button
                className="primary"
                disabled={busy}
                onClick={() => void save()}
              >
                Confirm and save
              </button>
            </div>
          ) : (
            <>
              <button
                className="primary wide"
                disabled={busy}
                onClick={() => void generate()}
              >
                Generate report
              </button>
              <DictationButton
                label="Say generate report"
                onTranscript={(text) =>
                  /generate report/i.test(text)
                    ? void generate("voice")
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
