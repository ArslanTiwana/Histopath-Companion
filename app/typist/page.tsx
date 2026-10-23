"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppNav from "@/app/components/AppNav";
import DictationButton from "@/app/components/DictationButton";
import { apiFetch } from "@/lib/api-fetch";
import { runConfirmedAction } from "@/lib/client-actions";
import { compactLocalDate, localDateKey } from "@/lib/local-date";

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
      setSelected(data.map((item) => item.id));
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
  return (
    <main className="app-shell">
      <Link href="/" className="back">
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
                  checked={selected.includes(item.id)}
                  onChange={(event) =>
                    setSelected((current) =>
                      event.target.checked
                        ? [...current, item.id]
                        : current.filter((id) => id !== item.id),
                    )
                  }
                />
                {item.caseLabel}
              </label>
            ))}
          </div>
          <button
            className="primary wide"
            disabled={!selected.length}
            onClick={() => setReview(true)}
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
            <button className="secondary" onClick={() => setReview(false)}>
              Cancel
            </button>
            <button className="primary" onClick={() => void send()}>
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
            <button onClick={download}>Download</button>
            <button onClick={() => void share()}>Email</button>
            <button onClick={() => void share()}>WhatsApp</button>
            <button onClick={() => window.print()}>Print</button>
          </div>
        </section>
      )}
      {!bundle && (
        <DictationButton
          label="Say send all approved to typist"
          onTranscript={(text) => {
            if (/confirm/i.test(text) && review) void send("voice");
            else if (/send.*typist/i.test(text)) setReview(true);
            else setError("Say send all approved to typist, then confirm.");
          }}
        />
      )}
      {error && <div className="error">{error}</div>}
      <AppNav active="cases" />
    </main>
  );
}
