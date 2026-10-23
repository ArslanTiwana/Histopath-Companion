"use client";

import Link from "@/app/components/ActionLink";
import { useEffect, useState } from "react";
import { z } from "zod";
import AppNav from "@/app/components/AppNav";
import DictationButton from "@/app/components/DictationButton";
import { apiFetch } from "@/lib/api-fetch";
import { runConfirmedAction } from "@/lib/client-actions";
import { compactLocalDate, localDateKey } from "@/lib/local-date";
import { useRegisterActions } from "@/app/components/ActionProvider";
import { defineAction, type AnyAction } from "@/lib/actions";

type Item = { id: number; caseLabel: string };
type Bundle = {
  count: number;
  filename: string;
  fileBase64: string;
  error?: string;
};

export default function TypistSendPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [review, setReview] = useState(false);
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    apiFetch<Item[]>("/api/typist/send").then((data: Item[]) => {
      setItems(data);
      const requestedId = Number(
        new URLSearchParams(window.location.search).get("caseId"),
      );
      setSelected(
        requestedId && data.some((item) => item.id === requestedId)
          ? [requestedId]
          : data.map((item) => item.id),
      );
    });
  }, []);
  async function send(source: "tap" | "voice" = "tap") {
    try {
      const response = await runConfirmedAction<Bundle>("send_to_typist", {
        caseIds: selected,
        localDate: localDateKey(),
        source,
      });
      setBundle(response.result);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not prepare file",
      );
    }
  }
  function makeFile() {
    if (!bundle) return;
    const bytes = Uint8Array.from(atob(bundle.fileBase64), (character) =>
      character.charCodeAt(0),
    );
    return new File([bytes], bundle.filename, {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
  }
  function download() {
    const file = makeFile();
    if (!file) return;
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    link.click();
    URL.revokeObjectURL(url);
  }
  async function share() {
    const file = makeFile();
    if (!file) return;
    if (navigator.share && navigator.canShare?.({ files: [file] }))
      await navigator.share({ title: file.name, files: [file] });
    else download();
  }
  const screenActions: AnyAction[] = [
    defineAction({
      id: "select_typist_case",
      description: "Select or deselect an approved report.",
      args: z.object({
        caseId: z.number().int().positive(),
        selected: z.boolean(),
      }),
      screens: ["typist_bundle"],
      risk: "safe",
      describe: ({ caseId, selected: value }) =>
        `${value ? "Select" : "Deselect"} ${caseId}`,
      run: ({ caseId, selected: value }) =>
        setSelected((current) =>
          value
            ? Array.from(new Set([...current, caseId]))
            : current.filter((id) => id !== caseId),
        ),
    }),
    defineAction({
      id: "review_typist_send",
      description: "Review the selected typist bundle.",
      args: z.object({}),
      screens: ["typist_bundle"],
      risk: "safe",
      describe: () => "Review typist send",
      run: () => setReview(true),
    }),
    defineAction({
      id: "cancel_typist_send",
      description: "Return to typist selection.",
      args: z.object({}),
      screens: ["typist_bundle"],
      risk: "safe",
      describe: () => "Cancel typist send",
      run: () => setReview(false),
    }),
    defineAction({
      id: "send_to_typist",
      description: "Send selected reports and prepare the typist file.",
      args: z.object({}),
      screens: ["typist_bundle"],
      risk: "confirm",
      describe: () => `Send ${selected.length} reports to typist`,
      run: (_args, ctx) => send(ctx.source),
    }),
    defineAction({
      id: "download_typist_file",
      description: "Download the prepared typist file.",
      args: z.object({}),
      screens: ["typist_bundle"],
      risk: "safe",
      describe: () => "Download typist file",
      run: download,
    }),
    defineAction({
      id: "share_typist_file",
      description: "Share the prepared typist file.",
      args: z.object({}),
      screens: ["typist_bundle"],
      risk: "safe",
      describe: () => "Share typist file",
      run: share,
    }),
    defineAction({
      id: "print_typist_file",
      description: "Print the prepared typist file.",
      args: z.object({}),
      screens: ["typist_bundle"],
      risk: "safe",
      describe: () => "Print typist file",
      run: () => window.print(),
    }),
  ];
  const actions = useRegisterActions("typist_bundle", screenActions, () => ({
    screenId: "typist_bundle",
    selectedCaseIds: selected,
    review,
    bundle: bundle?.filename || null,
  }));
  return (
    <main className="app-shell">
      <Link data-action="navigate" href="/" className="back">
        ← Worklist
      </Link>
      <div className="eyebrow">APPROVED REPORTS</div>
      <h1>Send to typist</h1>
      {!review && !bundle && (
        <>
          <section className="detail-card">
            <div className="summary-row">
              <span>✓</span>
              <b>Approved</b>
              <strong>{selected.length} reports</strong>
            </div>
            <div className="summary-row">
              <span>✓</span>
              <b>File</b>
              <strong>
                Typist_{compactLocalDate()}
                .docx
              </strong>
            </div>
          </section>
          <div className="bulk-list">
            {items.map((item) => (
              <label key={item.id}>
                <input
                  type="checkbox"
                  data-action="select_typist_case"
                  checked={selected.includes(item.id)}
                  onChange={(event) =>
                    void actions.run("select_typist_case", {
                      caseId: item.id,
                      selected: event.target.checked,
                    })
                  }
                />
                {item.caseLabel}
              </label>
            ))}
          </div>
          <button
            className="primary wide"
            data-action="review_typist_send"
            disabled={!selected.length}
            onClick={() => void actions.run("review_typist_send")}
          >
            Review send
          </button>
        </>
      )}
      {review && !bundle && (
        <section className="detail-card readback">
          <h2>Send {selected.length} approved reports?</h2>
          <p>
            After confirmation, these cases move to With typist and one file is
            prepared.
          </p>
          <div className="gross-actions">
            <button
              data-action="cancel_typist_send"
              className="secondary"
              onClick={() => void actions.run("cancel_typist_send")}
            >
              Cancel
            </button>
            <button
              data-action="send_to_typist"
              className="primary"
              onClick={() => void actions.run("send_to_typist")}
            >
              Confirm and prepare
            </button>
          </div>
        </section>
      )}
      {bundle && (
        <section className="detail-card">
          <h2>{bundle.count} reports ready</h2>
          <p>{bundle.filename}</p>
          <div className="share-grid">
            <button
              data-action="download_typist_file"
              onClick={() => void actions.run("download_typist_file")}
            >
              Download
            </button>
            <button
              data-action="share_typist_file"
              onClick={() => void actions.run("share_typist_file")}
            >
              Email
            </button>
            <button
              data-action="share_typist_file"
              onClick={() => void actions.run("share_typist_file")}
            >
              WhatsApp
            </button>
            <button
              data-action="print_typist_file"
              onClick={() => void actions.run("print_typist_file")}
            >
              Print
            </button>
          </div>
        </section>
      )}
      {!bundle && (
        <DictationButton
          label="Say send all approved to typist"
          onTranscript={(text) => {
            if (/confirm/i.test(text) && review)
              void actions.run("send_to_typist", {}, { source: "voice" });
            else if (/send.*typist/i.test(text))
              void actions.run("review_typist_send", {}, { source: "voice" });
            else setError("Say send all approved to typist, then confirm.");
          }}
        />
      )}
      {error && <div className="error">{error}</div>}
      <AppNav active="cases" />
    </main>
  );
}
