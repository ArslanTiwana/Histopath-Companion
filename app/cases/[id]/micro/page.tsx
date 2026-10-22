"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import HelpPanel from "@/app/components/HelpPanel";
import AppNav from "@/app/components/AppNav";
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
  const [recording, setRecording] = useState(false);
  const [review, setReview] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [error, setError] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  useEffect(() => {
    fetch(`/api/cases/${params.id}/micro`)
      .then((response) => response.json())
      .then(setItem);
  }, [params.id]);
  async function startVoice() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const media = new MediaRecorder(stream);
      recorder.current = media;
      chunks.current = [];
      media.ondataavailable = (event) => {
        if (event.data.size) chunks.current.push(event.data);
      };
      media.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false);
        setBusy(true);
        const form = new FormData();
        form.append(
          "audio",
          new Blob(chunks.current, { type: media.mimeType || "audio/webm" }),
        );
        try {
          const response = await fetch("/api/voice/transcribe", {
            method: "POST",
            body: form,
          });
          const result = (await response.json()) as {
            transcript?: string;
            error?: string;
          };
          if (!result.transcript)
            throw new Error(result.error || "I didn't catch that");
          const spoken = result.transcript.trim();
          if (/^(save|confirm|confirm and save)$/i.test(spoken) && review)
            void save();
          else
            setDictation((current) =>
              current ? `${current} ${spoken}` : spoken,
            );
        } catch (cause) {
          setError(
            cause instanceof Error ? cause.message : "Transcription failed",
          );
        } finally {
          setBusy(false);
        }
      };
      media.start();
      setRecording(true);
    } catch {
      setError("Microphone permission is required. Type the findings instead.");
    }
  }
  async function suggest() {
    if (dictation.trim().length < 3) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/cases/${params.id}/micro/suggest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ findings: dictation }),
      });
      const result = (await response.json()) as {
        differential?: string[];
        ihc?: string[];
        error?: string;
      };
      if (!response.ok) throw new Error(result.error);
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
  async function save(sendToConsultant = false) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/cases/${params.id}/micro`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dictation,
          differential,
          ihc,
          provisionalDx,
          notes,
          confirmed: true,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error);
      if (sendToConsultant) {
        const sendResponse = await fetch("/api/consultant/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            caseIds: [Number(params.id)],
            confirmed: true,
          }),
        });
        const sendResult = (await sendResponse.json()) as { error?: string };
        if (!sendResponse.ok) throw new Error(sendResult.error);
      }
      window.location.href = `/cases/${params.id}`;
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save microscopy",
      );
      setBusy(false);
    }
  }
  if (!item) return <main className="app-shell">Loading…</main>;
  if (item.status !== "micro_pending")
    return (
      <main className="app-shell">
        <Link href={`/cases/${params.id}`} className="back">
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
      <Link href={`/cases/${params.id}`} className="back">
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
      <button className="help-button" onClick={() => setHelpOpen(true)}>
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
            onClick={() =>
              window.speechSynthesis?.speak(
                new SpeechSynthesisUtterance(
                  `Findings. ${dictation}. Provisional diagnosis. ${provisionalDx || "Not set"}`,
                ),
              )
            }
          >
            🔊 Read aloud
          </button>
          <div className="gross-actions">
            <button className="secondary" onClick={() => setReview(false)}>
              Edit
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={() => void save(false)}
            >
              Confirm and save
            </button>
          </div>
          <button
            className="secondary wide"
            disabled={busy}
            onClick={() => void save(true)}
          >
            Confirm, save and send to consultant
          </button>
          <button
            className="voice-answer wide"
            onClick={() =>
              recording ? recorder.current?.stop() : void startVoice()
            }
          >
            {recording ? "■ Stop" : "🎙 Say confirm and save"}
          </button>
        </div>
      ) : (
        <>
          <div className="detail-card">
            <label className="field-label">
              Microscopy findings
              <textarea
                value={dictation}
                onChange={(event) => setDictation(event.target.value)}
                placeholder="Describe the microscopic findings…"
              />
            </label>
            <button
              className="voice-answer wide"
              onClick={() =>
                recording ? recorder.current?.stop() : void startVoice()
              }
            >
              {recording ? "■ Stop" : "🎙 Add dictation"}
            </button>
            <button
              className="secondary wide"
              disabled={busy || dictation.trim().length < 3}
              onClick={() => void suggest()}
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
                onClick={() => {
                  setDifferential([]);
                  setIhc([]);
                }}
              >
                Ignore suggestions
              </button>
            </div>
          )}
          <div className="detail-card">
            <label className="field-label">
              Your provisional diagnosis
              <input
                value={provisionalDx}
                onChange={(event) => setProvisionalDx(event.target.value)}
                placeholder="Optional provisional diagnosis"
              />
            </label>
            <button
              className="primary wide"
              disabled={dictation.trim().length < 3}
              onClick={() => setReview(true)}
            >
              Read back and save
            </button>
          </div>
        </>
      )}
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
