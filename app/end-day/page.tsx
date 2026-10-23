"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppNav from "@/app/components/AppNav";
import DictationButton from "@/app/components/DictationButton";
import { apiFetch } from "@/lib/api-fetch";
import {
  cancelAction,
  confirmAction,
  prepareAction,
  runConfirmedAction,
  type PendingActionResponse,
} from "@/lib/client-actions";
import { localDateKey } from "@/lib/local-date";

type Summary = {
  done: number;
  revisit: number;
  learned: number;
  reminders: {
    id: number;
    text: string;
    dueAt: string;
    case: { caseLabel: string } | null;
  }[];
  carry: { id: number; caseLabel: string; status: string }[];
};

export default function EndDayPage() {
  const [data, setData] = useState<Summary | null>(null);
  const [text, setText] = useState("");
  const [when, setWhen] = useState("tomorrow");
  const [review, setReview] = useState(false);
  const [reminderPending, setReminderPending] =
    useState<PendingActionResponse | null>(null);
  const [message, setMessage] = useState("");

  async function load() {
    setData(await apiFetch<Summary>("/api/end-day"));
  }

  useEffect(() => {
    void load();
  }, []);

  async function reviewReminder() {
    try {
      setReminderPending(
        await prepareAction("create_reminder", {
          text,
          when,
          source: "tap",
        }),
      );
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "Could not review reminder",
      );
    }
  }

  async function addReminder() {
    if (!reminderPending) return;
    try {
      await confirmAction(reminderPending.token);
      setText("");
      setReminderPending(null);
      setMessage("Reminder saved");
      await load();
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "Could not save reminder",
      );
    }
  }

  async function closeDay() {
    try {
      await runConfirmedAction("close_day", { source: "tap" });
      localStorage.setItem("histopath_day_closed", localDateKey());
      setMessage("Day closed. Tomorrow's briefing is ready.");
      setReview(false);
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "Could not close day",
      );
    }
  }

  function voice(value: string) {
    if (/close day/i.test(value)) return setReview(true);
    const reminder = value.match(/remind me\s+(.+)/i);
    if (reminder) {
      setWhen(reminder[1]);
      setText("Follow up");
    }
  }

  if (!data) return <main className="app-shell">Loading summary…</main>;
  return (
    <main className="app-shell">
      <Link href="/" className="back">
        ← Worklist
      </Link>
      <div className="eyebrow">
        {new Date().toLocaleDateString(undefined, {
          weekday: "short",
          day: "numeric",
          month: "short",
        })}
      </div>
      <h1>End of day</h1>
      <div className="day-counts">
        <div>
          <strong>{data.done}</strong>
          <span>Done</span>
        </div>
        <div>
          <strong>{data.revisit}</strong>
          <span>Revisit</span>
        </div>
        <div>
          <strong>{data.learned}</strong>
          <span>Learned</span>
        </div>
      </div>
      <section className="detail-card form-stack">
        <h3>Add reminder</h3>
        {reminderPending ? (
          <div className="readback">
            <p>{reminderPending.readBackText}</p>
            <div className="gross-actions">
              <button
                className="secondary"
                onClick={() => {
                  void cancelAction(reminderPending.token);
                  setReminderPending(null);
                }}
              >
                Edit
              </button>
              <button className="primary" onClick={() => void addReminder()}>
                Confirm reminder
              </button>
            </div>
          </div>
        ) : (
          <>
            <input
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Colon IHC"
            />
            <input
              value={when}
              onChange={(event) => setWhen(event.target.value)}
              placeholder="Thursday or 2026-10-29"
            />
            <button
              className="secondary"
              disabled={!text.trim()}
              onClick={() => void reviewReminder()}
            >
              Review and save reminder
            </button>
          </>
        )}
      </section>
      <div className="end-list">
        {data.reminders.slice(0, 4).map((item) => (
          <div className="summary-row" key={item.id}>
            <span>✓</span>
            <b>{item.case?.caseLabel || item.text}</b>
            <strong>{new Date(item.dueAt).toLocaleDateString()}</strong>
          </div>
        ))}
        {data.carry.slice(0, 4).map((item) => (
          <div className="summary-row" key={item.id}>
            <span>→</span>
            <b>{item.caseLabel}</b>
            <strong>Carry</strong>
          </div>
        ))}
      </div>
      <p className="form-note">
        Close the day to save the summary. Tomorrow starts with these reminders.
      </p>
      {review ? (
        <section className="detail-card readback">
          <h2>Close today?</h2>
          <p>
            {data.done} done, {data.revisit} reminders, and {data.carry.length}{" "}
            carried over.
          </p>
          <div className="gross-actions">
            <button className="secondary" onClick={() => setReview(false)}>
              Cancel
            </button>
            <button className="primary" onClick={() => void closeDay()}>
              Confirm close day
            </button>
          </div>
        </section>
      ) : (
        <button className="primary wide" onClick={() => setReview(true)}>
          Close day
        </button>
      )}
      <DictationButton
        label="Say remind me Thursday or close day"
        onTranscript={voice}
      />
      {message && <div className="notice">{message}</div>}
      <AppNav />
    </main>
  );
}
