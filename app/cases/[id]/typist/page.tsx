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

type DiffRow = {
  field: string;
  label: string;
  approved: string;
  typed: string;
  matches: boolean;
  hint?: string;
};
type Data = {
  id: number;
  caseLabel: string;
  status: string;
  report: { content: Record<string, string> } | null;
  typistChecks: {
    diff: DiffRow[];
    result: string;
    corrections: string[] | null;
  }[];
};

export default function TypistPage({ params }: { params: { id: string } }) {
  const [item, setItem] = useState<Data | null>(null);
  const [typedText, setTypedText] = useState("");
  const [review, setReview] = useState(false);
  const [diff, setDiff] = useState<DiffRow[]>([]);
  const [overrideReason, setOverrideReason] = useState("");
  const [error, setError] = useState("");
  const [overrideOpen, setOverrideOpen] = useState(false);
  const load = useCallback(async () => {
    const data = await apiFetch<Data>(`/api/cases/${params.id}/typist`);
    setItem(data);
    const latest = data.typistChecks[0];
    if (latest && latest.result !== "returned") setDiff(latest.diff);
    else {
      setDiff([]);
      setTypedText("");
      setReview(false);
    }
  }, [params.id]);
  useEffect(() => {
    void load();
  }, [load]);
  async function action(
    actionName: string,
    args: Record<string, unknown>,
    source: "tap" | "voice" = "tap",
  ) {
    setError("");
    try {
      const response = await runConfirmedAction<{ diff?: DiffRow[] }>(
        actionName,
        { caseId: Number(params.id), ...args, source },
      );
      if (response.result.diff) setDiff(response.result.diff);
      await load();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Typist action failed");
      return false;
    }
  }
  async function deliver(reason?: string, source: "tap" | "voice" = "tap") {
    if (
      await action(
        reason ? "override_delivery" : "deliver_case",
        reason ? { reason } : {},
        source,
      )
    )
      window.location.href = `/cases/${params.id}/delivered`;
  }
  async function sendBack(source: "tap" | "voice" = "tap") {
    const sent = await action(
      "send_back_typist",
      { fields: differences.map((row) => row.label) },
      source,
    );
    if (sent) {
      setDiff([]);
      setTypedText("");
      setReview(false);
    }
  }
  async function parseAndCheck(source: "tap" | "voice") {
    const parsed = await apiFetch<{ canonicalText: string }>(
      `/api/cases/${params.id}/typist/parse`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: typedText }),
      },
    );
    return action("check_typist", { typedText: parsed.canonicalText }, source);
  }
  function voice(text: string) {
    const lower = text.toLowerCase();
    if (lower.includes("confirm") || lower.includes("deliver"))
      void actions.run("deliver_case", {}, { source: "voice" });
    else if (lower.includes("send back") && diff.some((row) => !row.matches))
      void actions.run("send_back_typist", {}, { source: "voice" });
    else
      void actions.run(
        "set_typed_report",
        { text, append: true },
        { source: "voice" },
      );
  }
  const screenActions: AnyAction[] = [
    defineAction({
      id: "upload_typed_report",
      description: "Load typed report text from a txt or docx file.",
      args: z.object({
        file: z.custom<File>(
          (value) => typeof File !== "undefined" && value instanceof File,
        ),
      }),
      screens: ["typist_check"],
      risk: "safe",
      describe: () => "Upload typed report",
      run: async ({ file }) => {
        const form = new FormData();
        form.append("file", file);
        const result = await apiFetch<{ text: string }>(
          `/api/cases/${params.id}/typist/upload`,
          { method: "POST", body: form },
        );
        setTypedText(result.text);
      },
    }),
    defineAction({
      id: "open_override",
      description: "Open or close delivery override controls.",
      args: z.object({ open: z.boolean().optional() }),
      screens: ["typist_check"],
      risk: "safe",
      describe: () => "Open delivery override",
      run: ({ open }) => setOverrideOpen((current) => open ?? !current),
    }),
    defineAction({
      id: "set_typed_report",
      description: "Set or append typist report text.",
      args: z.object({ text: z.string(), append: z.boolean().default(false) }),
      screens: ["typist_check"],
      risk: "safe",
      describe: () => "Set typed report text",
      run: ({ text, append }) =>
        setTypedText((current) =>
          append && current ? `${current}\n${text}` : text,
        ),
    }),
    defineAction({
      id: "enter_typist_review",
      description: "Read typed report aloud before comparison.",
      args: z.object({}),
      screens: ["typist_check"],
      risk: "safe",
      describe: () => "Review typed report",
      run: () => {
        setReview(true);
        window.speechSynthesis?.speak(new SpeechSynthesisUtterance(typedText));
      },
    }),
    defineAction({
      id: "edit_typist_report",
      description: "Return to typist report editing.",
      args: z.object({}),
      screens: ["typist_check"],
      risk: "safe",
      describe: () => "Edit typed report",
      run: () => setReview(false),
    }),
    defineAction({
      id: "check_typist",
      description: "Compare typed report with the approved report.",
      args: z.object({}),
      screens: ["typist_check"],
      risk: "confirm",
      describe: () => "Compare typed report",
      run: (_args, ctx) => parseAndCheck(ctx.source),
    }),
    defineAction({
      id: "send_back_typist",
      description: "Return listed corrections to typist.",
      args: z.object({}),
      screens: ["typist_check"],
      risk: "confirm",
      describe: () => "Send differences back to typist",
      run: (_args, ctx) => sendBack(ctx.source),
    }),
    defineAction({
      id: "set_override_reason",
      description: "Set the delivery override reason.",
      args: z.object({ reason: z.string() }),
      screens: ["typist_check"],
      risk: "safe",
      describe: ({ reason: value }) => `Set override reason to ${value}`,
      run: ({ reason: value }) => setOverrideReason(value),
    }),
    defineAction({
      id: "deliver_case",
      description:
        "Deliver and lock a matching report, or use an override reason.",
      args: z.object({ reason: z.string().optional() }),
      screens: ["typist_check"],
      risk: "confirm",
      describe: ({ reason: value }) =>
        value
          ? `Override and deliver because ${value}`
          : "Deliver and lock case",
      run: ({ reason: value }, ctx) => deliver(value, ctx.source),
    }),
  ];
  const actions = useRegisterActions("typist_check", screenActions, () => ({
    screenId: "typist_check",
    caseLabel: item?.caseLabel,
    typedText,
    dictationTarget: "typed_report",
    mode: diff.length ? "comparison" : review ? "review" : "entry",
    differences: diff.filter((row) => !row.matches).map((row) => row.label),
    overrideReason,
    modal: overrideOpen ? "delivery_override" : null,
  }));
  if (!item)
    return (
      <main className="app-shell">
        <LoadingState label="Loading typist check" />
      </main>
    );
  const differences = diff.filter((row) => !row.matches);
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
          <div className="eyebrow">REPORT → TYPIST → DELIVERED</div>
          <h1>Typist check · {item.caseLabel}</h1>
        </div>
        {diff.length > 0 && (
          <span className="status-pill">{differences.length} differences</span>
        )}
      </header>
      {!diff.length && (
        <>
          {review ? (
            <section className="detail-card readback">
              <h3>Typed report read-back</h3>
              <pre className="typed-preview">{typedText}</pre>
              <div className="gross-actions">
                <button
                  data-action="edit_typist_report"
                  className="secondary"
                  onClick={() => void actions.run("edit_typist_report")}
                >
                  Edit
                </button>
                <button
                  className="primary"
                  data-action="check_typist"
                  onClick={() => void actions.run("check_typist")}
                >
                  Confirm and compare
                </button>
              </div>
            </section>
          ) : (
            <section className="detail-card">
              <label className="field-label">
                Paste the typed report
                <textarea
                  data-action="set_typed_report"
                  value={typedText}
                  onChange={(event) =>
                    void actions.run("set_typed_report", {
                      text: event.target.value,
                    })
                  }
                  placeholder={
                    "Diagnosis: …\nGrade: …\nStage: …\nMargins: …\nLaterality: …\nTumour size: …"
                  }
                />
              </label>
              <label className="field-label">
                Upload .txt or .docx
                <input
                  type="file"
                  accept=".txt,.docx"
                  data-action="upload_typed_report"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void actions.run("upload_typed_report", { file });
                  }}
                />
              </label>
              <DictationButton
                label="Dictate typed report"
                onTranscript={(text) =>
                  void actions.run(
                    "set_typed_report",
                    { text, append: true },
                    { source: "voice" },
                  )
                }
              />
              <button
                className="primary wide"
                data-action="enter_typist_review"
                disabled={typedText.trim().length < 10}
                onClick={() => void actions.run("enter_typist_review")}
              >
                Read back before comparing
              </button>
            </section>
          )}
        </>
      )}
      {diff.length > 0 && (
        <>
          <div className="comparison-table">
            <div className="comparison-head">
              <b>Field</b>
              <b>Approved</b>
              <b>Typed</b>
            </div>
            {diff.map((row) => (
              <div
                className={
                  row.matches
                    ? "comparison-row match"
                    : "comparison-row difference"
                }
                key={row.field}
              >
                <b>{row.label}</b>
                <span>{row.approved}</span>
                <span>
                  {row.typed} {row.matches ? "✓" : "✕"}
                </span>
                {row.hint && <small>{row.hint}</small>}
              </div>
            ))}
          </div>
          {differences.length ? (
            <>
              <p className="error">
                {differences.some((row) => row.hint)
                  ? "Digits look swapped. "
                  : ""}
                Delivery stays locked until every field matches.
              </p>
              <button
                className="secondary wide"
                data-action="send_back_typist"
                onClick={() => void actions.run("send_back_typist")}
              >
                Send back to typist
              </button>
              <details className="override-box" open={overrideOpen}>
                <summary
                  data-action="open_override"
                  onClick={(event) => {
                    event.preventDefault();
                    void actions.run("open_override");
                  }}
                >
                  Override with a reason
                </summary>
                <textarea
                  data-action="set_override_reason"
                  value={overrideReason}
                  onChange={(event) =>
                    void actions.run("set_override_reason", {
                      reason: event.target.value,
                    })
                  }
                  placeholder="Reason required"
                />
                <button
                  className="primary wide"
                  data-action="deliver_case"
                  disabled={overrideReason.trim().length < 3}
                  onClick={() =>
                    void actions.run("deliver_case", { reason: overrideReason })
                  }
                >
                  Confirm override and deliver
                </button>
              </details>
            </>
          ) : (
            <button
              data-action="deliver_case"
              className="primary wide"
              onClick={() => void actions.run("deliver_case")}
            >
              Confirm &amp; deliver
            </button>
          )}
          <DictationButton
            label="Say send back or confirm delivery"
            onTranscript={voice}
          />
        </>
      )}
      {error && <div className="error">{error}</div>}
      <AppNav active="cases" />
    </main>
  );
}
