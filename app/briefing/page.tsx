"use client";

import Link from "@/app/components/ActionLink";
import { useEffect, useState } from "react";
import { z } from "zod";
import AppNav from "@/app/components/AppNav";
import DictationButton from "@/app/components/DictationButton";
import { useRegisterActions } from "@/app/components/ActionProvider";
import { apiFetch } from "@/lib/api-fetch";
import { defineAction, type AnyAction } from "@/lib/actions";
import { localDateKey } from "@/lib/local-date";

type Briefing = {
  summary: string;
  waitingIhc: number;
  reminders: {
    id: number;
    text: string;
    dueAt: string;
    case: {
      id: number;
      caseLabel: string;
      specimenType: string | null;
      status: string;
    } | null;
  }[];
  waitingConsultant: {
    id: number;
    caseLabel: string;
    specimenType: string | null;
    status: string;
    updatedAt: string;
  }[];
};

export default function BriefingPage() {
  const [data, setData] = useState<Briefing | null>(null);
  useEffect(() => {
    apiFetch<Briefing>("/api/briefing").then((value) => {
      setData(value);
      window.speechSynthesis?.speak(
        new SpeechSynthesisUtterance(value.summary),
      );
    });
  }, []);
  function openWorklist() {
    localStorage.setItem("histopath_briefing_seen", localDateKey());
    window.location.href = "/";
  }
  const screenActions: AnyAction[] = [
    defineAction({
      id: "open_worklist",
      description: "Mark the briefing seen and open the worklist.",
      args: z.object({}),
      screens: ["briefing"],
      risk: "safe",
      describe: () => "Open worklist",
      run: openWorklist,
    }),
  ];
  const actions = useRegisterActions("briefing", screenActions, () => ({
    screenId: "briefing",
    summary: data?.summary,
    reminders: data?.reminders.map((item) => item.text) || [],
    modal: null,
  }));
  if (!data) return <main className="app-shell">Loading briefing…</main>;
  const rows = [
    ...data.reminders.map((reminder) => ({
      id: reminder.case?.id,
      title: reminder.case
        ? `${reminder.case.caseLabel} · ${reminder.case.specimenType || "Specimen"}`
        : reminder.text,
      detail: reminder.text,
      tag: "Revisit",
    })),
    ...data.waitingConsultant.map((item) => ({
      id: item.id,
      title: `${item.caseLabel} · ${item.specimenType || "Specimen"}`,
      detail: "Awaiting consultant final",
      tag: "Waiting",
    })),
  ];
  return (
    <main className="app-shell">
      <div className="eyebrow">
        {new Date().toLocaleDateString(undefined, {
          weekday: "short",
          day: "numeric",
          month: "short",
        })}
      </div>
      <h1>Good morning</h1>
      <section className="spoken-card">
        <span>🔊</span>
        <div>
          <b>Spoken by the app</b>
          <p>{data.summary}</p>
        </div>
      </section>
      <div className="briefing-list">
        {rows.map((row, index) =>
          row.id ? (
            <Link
              data-action="navigate"
              className="learned-row"
              href={`/cases/${row.id}`}
              key={`${row.title}-${index}`}
            >
              <div>
                <strong>{row.title}</strong>
                <span>{row.detail}</span>
              </div>
              <b>{row.tag}</b>
            </Link>
          ) : (
            <div className="learned-row" key={`${row.title}-${index}`}>
              <div>
                <strong>{row.title}</strong>
                <span>{row.detail}</span>
              </div>
              <b>{row.tag}</b>
            </div>
          ),
        )}
        {!rows.length && (
          <p className="empty">Nothing needs attention this morning.</p>
        )}
      </div>
      <button
        data-action="open_worklist"
        className="primary wide"
        onClick={() => void actions.run("open_worklist")}
      >
        Open worklist
      </button>
      <DictationButton
        label="Say open worklist"
        onTranscript={(text) =>
          /worklist|open/i.test(text) &&
          void actions.run("open_worklist", {}, { source: "voice" })
        }
      />
      <AppNav />
    </main>
  );
}
