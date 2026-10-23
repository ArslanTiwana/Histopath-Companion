"use client";

import Link from "@/app/components/ActionLink";
import { useEffect, useState } from "react";
import { z } from "zod";
import AppNav from "@/app/components/AppNav";
import { LoadingState } from "@/app/components/ScreenState";
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
import { parseReminderCommand } from "@/lib/reminders";
import { useRegisterActions } from "@/app/components/ActionProvider";
import { defineAction, type AnyAction } from "@/lib/actions";

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
  const [reminderCaseId, setReminderCaseId] = useState<number | undefined>();
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

  async function reviewReminder(source: "tap" | "voice" = "tap") {
    try {
      setReminderPending(
        await prepareAction("create_reminder", {
          text,
          when,
          caseId: reminderCaseId,
          source,
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
      setReminderCaseId(undefined);
      setReminderPending(null);
      setMessage("Reminder saved");
      await load();
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "Could not save reminder",
      );
    }
  }

  async function closeDay(source: "tap" | "voice" = "tap") {
    try {
      await runConfirmedAction("close_day", { source });
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
    if (/close day/i.test(value)) {
      void actions.run("review_close_day", {}, { source: "voice" });
      return;
    }
    const reminder = parseReminderCommand(value);
    if (reminder) {
      const linked = reminder.label
        ? data?.carry.find((item) => item.caseLabel === reminder.label)
        : undefined;
      void actions.run(
        "create_reminder",
        { when: reminder.when, text: reminder.text, caseId: linked?.id },
        { source: "voice" },
      );
    }
  }

  const screenActions: AnyAction[] = [
    defineAction({
      id: "set_reminder_fields",
      description: "Set reminder text or date.",
      args: z.object({
        text: z.string().optional(),
        when: z.string().optional(),
        caseId: z.number().int().positive().optional(),
      }),
      screens: ["end_day"],
      risk: "safe",
      describe: () => "Edit reminder",
      run: ({ text: nextText, when: nextWhen, caseId }) => {
        if (nextText !== undefined) setText(nextText);
        if (nextWhen !== undefined) setWhen(nextWhen);
        if (caseId !== undefined) setReminderCaseId(caseId);
      },
    }),
    defineAction({
      id: "review_reminder",
      description: "Read back a reminder before saving.",
      args: z.object({}),
      screens: ["end_day"],
      risk: "safe",
      describe: () => "Review reminder",
      run: (_args, ctx) => reviewReminder(ctx.source),
    }),
    defineAction({
      id: "create_reminder",
      description: "Confirm and save the pending reminder.",
      args: z.object({
        text: z.string().optional(),
        when: z.string().optional(),
        caseId: z.number().int().positive().optional(),
      }),
      screens: ["end_day"],
      risk: "confirm",
      describe: ({ text: nextText, when: nextWhen }) =>
        `Save reminder ${nextText || text} for ${nextWhen || when}`,
      run: async ({ text: nextText, when: nextWhen, caseId }, ctx) => {
        if (reminderPending) return addReminder();
        if (ctx.confirmed)
          return runConfirmedAction("create_reminder", {
            caseId: caseId || reminderCaseId,
            text: nextText || text,
            when: nextWhen || when,
            source: ctx.source,
          }).then(async () => {
            setText("");
            setMessage("Reminder saved");
            await load();
          });
        return reviewReminder(ctx.source);
      },
    }),
    defineAction({
      id: "cancel_reminder_review",
      description: "Cancel the reminder read-back and edit it.",
      args: z.object({}),
      screens: ["end_day"],
      risk: "safe",
      describe: () => "Edit reminder",
      run: async () => {
        if (reminderPending) await cancelAction(reminderPending.token);
        setReminderPending(null);
      },
    }),
    defineAction({
      id: "complete_reminder",
      description: "Mark a reminder complete.",
      args: z.object({ id: z.number().int().positive() }),
      screens: ["end_day"],
      risk: "confirm",
      describe: () => "Complete reminder",
      run: async ({ id }, ctx) => {
        await runConfirmedAction("complete_reminder", {
          id,
          source: ctx.source,
        });
        await load();
      },
    }),
    defineAction({
      id: "delete_reminder",
      description: "Delete a reminder.",
      args: z.object({ id: z.number().int().positive() }),
      screens: ["end_day"],
      risk: "confirm",
      describe: () => "Delete reminder",
      run: async ({ id }, ctx) => {
        await runConfirmedAction("delete_reminder", { id, source: ctx.source });
        await load();
      },
    }),
    defineAction({
      id: "review_close_day",
      description: "Open the close-day read-back.",
      args: z.object({}),
      screens: ["end_day"],
      risk: "safe",
      describe: () => "Review close day",
      run: () => setReview(true),
    }),
    defineAction({
      id: "cancel_close_day",
      description: "Cancel close-day review.",
      args: z.object({}),
      screens: ["end_day"],
      risk: "safe",
      describe: () => "Cancel close day",
      run: () => setReview(false),
    }),
    defineAction({
      id: "close_day",
      description: "Close today and save its summary.",
      args: z.object({}),
      screens: ["end_day"],
      risk: "confirm",
      describe: () => "Close today",
      run: (_args, ctx) => closeDay(ctx.source),
    }),
  ];
  const actions = useRegisterActions("end_day", screenActions, () => ({
    screenId: "end_day",
    reminder: { text, when },
    dictationTarget: "reminder_text",
    pendingReminder: reminderPending?.readBackText || null,
    modal: review ? "close_day" : null,
    counts: data
      ? { done: data.done, revisit: data.revisit, learned: data.learned }
      : null,
  }));

  if (!data)
    return (
      <main className="app-shell">
        <LoadingState label="Loading end-of-day summary" />
      </main>
    );
  return (
    <main className="app-shell">
      <Link data-action="navigate" href="/" className="back">
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
                data-action="cancel_reminder_review"
                onClick={() => void actions.run("cancel_reminder_review")}
              >
                Edit
              </button>
              <button
                data-action="create_reminder"
                className="primary"
                onClick={() => void actions.run("create_reminder")}
              >
                Confirm reminder
              </button>
            </div>
          </div>
        ) : (
          <>
            <input
              data-action="set_reminder_fields"
              value={text}
              onChange={(event) =>
                void actions.run("set_reminder_fields", {
                  text: event.target.value,
                })
              }
              placeholder="Colon IHC"
            />
            <input
              data-action="set_reminder_fields"
              value={when}
              onChange={(event) =>
                void actions.run("set_reminder_fields", {
                  when: event.target.value,
                })
              }
              placeholder="Thursday or 2026-10-29"
            />
            <button
              className="secondary"
              data-action="review_reminder"
              disabled={!text.trim()}
              onClick={() => void actions.run("review_reminder")}
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
            <button
              data-action="complete_reminder"
              onClick={() =>
                void actions.run("complete_reminder", { id: item.id })
              }
            >
              Done
            </button>
            <button
              data-action="delete_reminder"
              onClick={() =>
                void actions.run("delete_reminder", { id: item.id })
              }
            >
              Delete
            </button>
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
            <button
              data-action="cancel_close_day"
              className="secondary"
              onClick={() => void actions.run("cancel_close_day")}
            >
              Cancel
            </button>
            <button
              data-action="close_day"
              className="primary"
              onClick={() => void actions.run("close_day")}
            >
              Confirm close day
            </button>
          </div>
        </section>
      ) : (
        <button
          data-action="review_close_day"
          className="primary wide"
          onClick={() => void actions.run("review_close_day")}
        >
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
