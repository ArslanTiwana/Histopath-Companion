"use client";

import Link from "@/app/components/ActionLink";
import { useEffect, useMemo, useState } from "react";
import AppNav from "@/app/components/AppNav";
import { EmptyState, LoadingState } from "@/app/components/ScreenState";
import DictationButton from "@/app/components/DictationButton";
import { apiFetch } from "@/lib/api-fetch";
import { useRegisterActions } from "@/app/components/ActionProvider";
import { defineAction, type AnyAction } from "@/lib/actions";
import { z } from "zod";
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
  const [query, setQuery] = useState("");
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    apiFetch<Entry[]>("/api/learned")
      .then((value) => {
        setEntries(value);
        setNotes(
          Object.fromEntries(
            value.map((entry) => [entry.id, entry.learnedNote || ""]),
          ),
        );
      })
      .finally(() => setLoading(false));
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
  const screenActions: AnyAction[] = [
    defineAction({
      id: "search_learned",
      description: "Search learned differences by diagnosis or field.",
      args: z.object({ query: z.string() }),
      screens: ["learned"],
      risk: "safe",
      describe: ({ query }) => `Search learned log for ${query}`,
      run: ({ query }) => setQuery(query),
    }),
    defineAction({
      id: "set_learned_note",
      description: "Edit a learned note.",
      args: z.object({ id: z.number().int().positive(), note: z.string() }),
      screens: ["learned"],
      risk: "safe",
      describe: () => "Edit learned note",
      run: ({ id, note }) =>
        setNotes((current) => ({ ...current, [id]: note })),
    }),
    defineAction({
      id: "save_learned_note",
      description: "Save a learned note.",
      args: z.object({ id: z.number().int().positive() }),
      screens: ["learned"],
      risk: "confirm",
      describe: ({ id }) => `Save learned note ${id}`,
      run: async ({ id }) => {
        await apiFetch("/api/learned", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, note: notes[id] || "" }),
        });
        setEntries((current) =>
          current.map((entry) =>
            entry.id === id
              ? { ...entry, learnedNote: notes[id] || null }
              : entry,
          ),
        );
      },
    }),
  ];
  const shown = entries.filter((entry) => {
    const term = query.toLowerCase().trim();
    return (
      !term ||
      [
        entry.case.caseLabel,
        entry.case.specimenType || "",
        entry.learnedNote || "",
        ...entry.comparison.flatMap((row) => [
          row.label,
          row.resident,
          row.consultant,
        ]),
      ].some((value) => value.toLowerCase().includes(term))
    );
  });
  const actions = useRegisterActions("learned", screenActions, () => ({
    screenId: "learned",
    cases: entries.map((entry) => entry.case.caseLabel),
    pattern,
    modal: null,
    query,
  }));
  if (loading)
    return (
      <main className="app-shell">
        <LoadingState label="Loading learned differences" />
      </main>
    );
  return (
    <main className="app-shell">
      <div className="eyebrow">MY DIFFERENCE LOG</div>
      <h1>Learned from</h1>
      <input
        data-action="search_learned"
        value={query}
        placeholder="Search diagnosis or field"
        onChange={(event) =>
          void actions.run("search_learned", { query: event.target.value })
        }
      />
      <div className="learned-list">
        {shown.map((entry) => {
          const first = entry.comparison.find((row) => !row.matches);
          return (
            <div className="detail-card form-stack" key={entry.id}>
              <Link
                data-action="open_case"
                href={`/cases/${entry.case.id}`}
                className="learned-row"
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
              {entry.comparison
                .filter((row) => !row.matches)
                .map((row) => (
                  <p key={row.field}>
                    <b>{row.label}</b>: {row.resident} → {row.consultant}
                  </p>
                ))}
              <textarea
                data-action="set_learned_note"
                value={notes[entry.id] || ""}
                placeholder="What did I learn?"
                onChange={(event) =>
                  void actions.run("set_learned_note", {
                    id: entry.id,
                    note: event.target.value,
                  })
                }
              />
              <button
                className="secondary"
                data-action="save_learned_note"
                onClick={() =>
                  void actions.run("save_learned_note", { id: entry.id })
                }
              >
                Save note
              </button>
            </div>
          );
        })}
        {!shown.length && (
          <EmptyState
            title="No consultant differences yet"
            detail="Differences appear here after a consultant comparison is saved."
          />
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
