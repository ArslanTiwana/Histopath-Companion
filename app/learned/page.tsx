"use client";

import Link from "@/app/components/ActionLink";
import { useEffect, useMemo, useState } from "react";
import AppNav from "@/app/components/AppNav";
import DictationButton from "@/app/components/DictationButton";
import { apiFetch } from "@/lib/api-fetch";
import { useRegisterActions } from "@/app/components/ActionProvider";
import type { AnyAction } from "@/lib/actions";
import { normalizeCaseLabel } from "@/src/lib/voice/parser";

type Row = {
  field: string;
  label: string;
  resident: string;
  consultant: string;
  matches: boolean;
};
type Entry = {
  id: number;
  learnedNote: string | null;
  comparison: Row[];
  case: { id: number; caseLabel: string; specimenType: string | null };
};

export default function LearnedPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  useEffect(() => {
    apiFetch<Entry[]>("/api/learned").then(setEntries);
  }, []);
  const pattern = useMemo(() => {
    const counts: Record<string, number> = {};
    entries
      .flatMap((entry) => entry.comparison.filter((row) => !row.matches))
      .forEach((row) => {
        counts[row.label] = (counts[row.label] || 0) + 1;
      });
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return top
      ? `${top[1]} recorded differences involve ${top[0].toLowerCase()}.`
      : "No difference pattern yet.";
  }, [entries]);
  const actions = useRegisterActions("learned", [] as AnyAction[], () => ({
    screenId: "learned",
    cases: entries.map((entry) => entry.case.caseLabel),
    pattern,
    modal: null,
  }));
  return (
    <main className="app-shell">
      <div className="eyebrow">MY DIFFERENCE LOG</div>
      <h1>Learned from</h1>
      <div className="learned-list">
        {entries.map((entry) => {
          const first = entry.comparison.find((row) => !row.matches);
          return (
            <Link
              data-action="open_case"
              href={`/cases/${entry.case.id}`}
              className="learned-row"
              key={entry.id}
            >
              <div>
                <strong>
                  {entry.case.caseLabel} ·{" "}
                  {entry.case.specimenType || "Specimen"}
                </strong>
                <span>
                  {first
                    ? `${first.resident} vs ${first.consultant}`
                    : "Review saved"}{" "}
                  · {entry.learnedNote || "No note added"}
                </span>
              </div>
              <b>{first?.label || "Review"}</b>
            </Link>
          );
        })}
        {!entries.length && (
          <p className="empty">No consultant differences saved yet.</p>
        )}
      </div>
      <section className="pattern-card">
        <b>Pattern</b>
        <p>{pattern}</p>
      </section>
      <DictationButton
        label="Say open S-131"
        onTranscript={(text) => {
          const label = normalizeCaseLabel(text.replace(/^open\s+/i, ""));
          if (label)
            void actions.run("open_case", { label }, { source: "voice" });
        }}
      />
      <AppNav active="learn" />
    </main>
  );
}
