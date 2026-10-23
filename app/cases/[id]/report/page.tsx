"use client";

import Link from "@/app/components/ActionLink";
import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import AppNav from "@/app/components/AppNav";
import { LoadingState } from "@/app/components/ScreenState";
import DictationButton from "@/app/components/DictationButton";
import { apiFetch } from "@/lib/api-fetch";
import { runConfirmedAction } from "@/lib/client-actions";
import { useRegisterActions } from "@/app/components/ActionProvider";
import { defineAction, type AnyAction } from "@/lib/actions";

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
    template: { specimenType: string } | null;
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
    if (command.includes("read"))
      void actions.run("read_report", {}, { source: "voice" });
    else if (command.includes("approve"))
      void actions.run("approve_report", {}, { source: "voice" });
    else if (command.includes("edit"))
      void actions.run(
        "toggle_report_edit",
        { editing: true },
        { source: "voice" },
      );
    else setError("Say read it back, edit, or approve.");
  }
  const screenActions: AnyAction[] = [
    defineAction({
      id: "set_report_field",
      description: "Edit one report field.",
      args: z.object({ field: z.string(), value: z.string() }),
      screens: ["report"],
      risk: "safe",
      describe: ({ field }) => `Edit report ${field}`,
      run: ({ field, value }) =>
        setContent((current) => ({ ...current, [field]: value })),
    }),
    defineAction({
      id: "toggle_report_edit",
      description: "Switch between report edit and preview.",
      args: z.object({ editing: z.boolean().optional() }),
      screens: ["report"],
      risk: "safe",
      describe: () => "Toggle report editing",
      run: ({ editing: value }) => setEditing((current) => value ?? !current),
    }),
    defineAction({
      id: "generate_report",
      description: "Generate the report.",
      args: z.object({}),
      screens: ["report"],
      risk: "confirm",
      describe: () => "Generate report",
      run: (_args, ctx) => generate(ctx.source),
    }),
    defineAction({
      id: "read_report",
      description: "Speak and record read-back for this report version.",
      args: z.object({}),
      screens: ["report"],
      risk: "confirm",
      describe: () => "Read and save this report version",
      run: (_args, ctx) => readBack(ctx.source),
    }),
    defineAction({
      id: "approve_report",
      description: "Approve the current report version.",
      args: z.object({}),
      screens: ["report"],
      risk: "confirm",
      describe: () => "Approve this report",
      run: (_args, ctx) => approve(ctx.source),
    }),
  ];
  const actions = useRegisterActions("report", screenActions, () => ({
    screenId: "report",
    caseLabel: item?.caseLabel,
    content,
    editing,
    reportVersion: item?.report?.version,
    readBackVersion: item?.report?.readBackVersion,
    dictationTarget: "report_field",
  }));
  if (!item)
    return (
      <main className="app-shell">
        <LoadingState label="Loading report" />
      </main>
    );
  if (!item.report)
    return (
      <main className="app-shell">
        <Link
          data-action="navigate"
          href={`/cases/${params.id}`}
          className="back"
        >
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
            data-action="generate_report"
            disabled={busy}
            onClick={() => void actions.run("generate_report")}
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
      <Link
        data-action="navigate"
        href={`/cases/${params.id}`}
        className="back"
      >
        ← Case
      </Link>
      <header>
        <div>
          <div className="eyebrow">
            Template: {item.report.template?.specimenType || "standard report"}
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
                data-action="set_report_field"
                value={value}
                onChange={(event) =>
                  void actions.run("set_report_field", {
                    field: key,
                    value: event.target.value,
                  })
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
        data-action="read_report"
        disabled={busy}
        onClick={() => void actions.run("read_report")}
      >
        🔊 Read it back
      </button>
      <div className="gross-actions">
        <button
          className="secondary"
          data-action="toggle_report_edit"
          onClick={() => void actions.run("toggle_report_edit")}
        >
          {editing ? "Preview" : "Edit"}
        </button>
        <button
          className="primary"
          data-action="approve_report"
          disabled={busy || item.report.status === "approved"}
          onClick={() => void actions.run("approve_report")}
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
