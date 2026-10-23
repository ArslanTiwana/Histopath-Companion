"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import AppNav from "@/app/components/AppNav";
import DictationButton from "@/app/components/DictationButton";
import { apiFetch } from "@/lib/api-fetch";
import { runConfirmedAction } from "@/lib/client-actions";

type Content = Record<string, string>;
type Data = {
  id: number;
  caseLabel: string;
  specimenType: string | null;
  status: string;
  report: {
    content: Content;
    status: string;
    version: number;
    readBackVersion: number | null;
  } | null;
};
const labels: Record<string, string> = {
  specimen: "Specimen",
  gross: "Gross",
  microscopy: "Microscopy",
  diagnosis: "Diagnosis",
  grade: "Grade",
  stage: "Stage",
  margins: "Margins",
  laterality: "Laterality",
  tumourSize: "Tumour size",
};

export default function ReportPage({ params }: { params: { id: string } }) {
  const [item, setItem] = useState<Data | null>(null);
  const [content, setContent] = useState<Content>({});
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const data = await apiFetch<Data>(`/api/cases/${params.id}/report`);
    setItem(data);
    setContent(data.report?.content || {});
  }, [params.id]);
  useEffect(() => {
    void load();
  }, [load]);
  async function readBack(source: "tap" | "voice" = "tap") {
    const text = Object.entries(content)
      .map(([key, value]) => `${labels[key] || key}. ${value}`)
      .join(". ");
    setBusy(true);
    setError("");
    try {
      await new Promise<void>((resolve, reject) => {
        if (!window.speechSynthesis)
          return reject(new Error("Speech read-back is unavailable"));
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.onend = () => resolve();
        utterance.onerror = () => reject(new Error("Speech read-back failed"));
        window.speechSynthesis.speak(utterance);
      });
      await runConfirmedAction("read_report", {
        caseId: Number(params.id),
        content,
        source,
      });
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not read report",
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
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not generate report",
      );
    } finally {
      setBusy(false);
    }
  }
  async function approve(source: "tap" | "voice" = "tap") {
    setBusy(true);
    setError("");
    try {
      await runConfirmedAction("approve_report", {
        caseId: Number(params.id),
        content,
        source,
      });
    } catch (cause) {
      setBusy(false);
      return setError(
        cause instanceof Error ? cause.message : "Could not approve report",
      );
    }
    window.location.href = `/cases/${params.id}`;
  }
  function voiceAction(text: string) {
    const command = text.toLowerCase();
    if (command.includes("read")) void readBack("voice");
    else if (command.includes("approve")) void approve("voice");
    else if (command.includes("edit")) setEditing(true);
    else setError("Say read it back, edit, or approve.");
  }
  if (!item) return <main className="app-shell">Loading…</main>;
  if (!item.report)
    return (
      <main className="app-shell">
        <Link href={`/cases/${params.id}`} className="back">
          ← Case
        </Link>
        <div className="eyebrow">REPORT</div>
        <h1>Generate report · {item.caseLabel}</h1>
        <section className="detail-card">
          <p>
            The report will be built from the consultant diagnosis, gross
            description, and microscopy.
          </p>
          <button
            className="primary wide"
            disabled={busy}
            onClick={() => void generate()}
          >
            Confirm and generate report
          </button>
        </section>
        {error && <div className="error">{error}</div>}
        <AppNav active="cases" />
      </main>
    );
  return (
    <main className="app-shell">
      <Link href={`/cases/${params.id}`} className="back">
        ← Case
      </Link>
      <header>
        <div>
          <div className="eyebrow">
            Template: {item.specimenType || "standard report"}
          </div>
          <h1>Report preview · {item.caseLabel}</h1>
        </div>
        <span className="status-pill">{item.report.status}</span>
      </header>
      <div className="report-fields">
        {Object.entries(content).map(([key, value]) => (
          <label key={key} className="report-field">
            <span>✓</span>
            <b>{labels[key] || key}</b>
            {editing ? (
              <textarea
                value={value}
                onChange={(event) =>
                  setContent((current) => ({
                    ...current,
                    [key]: event.target.value,
                  }))
                }
              />
            ) : (
              <p>{value}</p>
            )}
          </label>
        ))}
      </div>
      <p className="form-note">
        Built from the consultant diagnosis. Read back before approving.
      </p>
      <button
        className="secondary wide"
        disabled={busy}
        onClick={() => void readBack("tap")}
      >
        🔊 Read it back
      </button>
      <div className="gross-actions">
        <button
          className="secondary"
          onClick={() => setEditing((value) => !value)}
        >
          {editing ? "Preview" : "Edit"}
        </button>
        <button
          className="primary"
          disabled={busy || item.report.status === "approved"}
          onClick={() => void approve()}
        >
          Approve
        </button>
      </div>
      <DictationButton
        label="Say read, edit, or approve"
        onTranscript={voiceAction}
      />
      {error && <div className="error">{error}</div>}
      <AppNav active="cases" />
    </main>
  );
}
