"use client";

import { useMemo, useState } from "react";
import { z } from "zod";
import Link from "@/app/components/ActionLink";
import AppNav from "@/app/components/AppNav";
import { useRegisterActions } from "@/app/components/ActionProvider";
import { EmptyState } from "@/app/components/ScreenState";
import { defineAction, type AnyAction } from "@/lib/actions";
import actionEntries from "@/lib/generated-voice-actions.json";

type VoiceActionEntry = {
  screen: string;
  id: string;
  risk: "safe" | "confirm";
  description: string;
};

function screenName(value: string) {
  if (value === "global") return "Every screen";
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function VoiceHelpPage() {
  const [query, setQuery] = useState("");
  const screenActions = useMemo<AnyAction[]>(
    () => [
      defineAction({
        id: "filter_voice_help",
        description: "Filter the voice phrase guide.",
        args: z.object({ query: z.string() }),
        screens: ["voice_help"],
        risk: "safe",
        describe: ({ query }) => `Find voice phrases for ${query}`,
        run: ({ query }) => setQuery(query),
      }),
    ],
    [],
  );
  const actions = useRegisterActions("voice_help", screenActions, () => ({
    screenId: "voice_help",
    query,
    modal: null,
  }));
  const grouped = useMemo(() => {
    const term = query.trim().toLowerCase();
    const groups = new Map<string, VoiceActionEntry[]>();
    for (const entry of actionEntries as VoiceActionEntry[]) {
      if (
        term &&
        !`${entry.screen} ${entry.id} ${entry.description}`
          .toLowerCase()
          .includes(term)
      )
        continue;
      const rows = groups.get(entry.screen) || [];
      rows.push(entry);
      groups.set(entry.screen, rows);
    }
    return Array.from(groups.entries());
  }, [query]);

  return (
    <main className="app-shell">
      <Link className="back" href="/settings" data-action="navigate">
        ‹ Settings
      </Link>
      <header>
        <div>
          <div className="eyebrow">VOICE GUIDE</div>
          <h1>How to talk to the app</h1>
        </div>
      </header>
      <p className="subtle">
        Say the bold phrase or use similar natural wording. The app reads back
        clinical saves and stage changes before asking you to confirm.
      </p>
      <label className="field-label">
        Find a screen or phrase
        <input
          type="search"
          value={query}
          data-action="filter_voice_help"
          placeholder="Try gross, consultant or next case"
          onChange={(event) =>
            void actions.run("filter_voice_help", { query: event.target.value })
          }
        />
      </label>
      <div className="voice-help-list">
        {grouped.map(([screen, entries]) => (
          <section className="detail-card" key={screen}>
            <h2>{screenName(screen)}</h2>
            <ul className="voice-help-actions">
              {entries.map((entry) => (
                <li key={`${screen}-${entry.id}`}>
                  <strong>“{entry.id.replaceAll("_", " ")}”</strong>
                  <code>
                    {entry.description}
                    {entry.risk === "confirm" ? " Read-back required." : ""}
                  </code>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {!grouped.length && (
          <EmptyState
            title="No matching phrases"
            detail="Try a screen name such as gross, report or settings."
          />
        )}
      </div>
      <AppNav active="settings" />
    </main>
  );
}
