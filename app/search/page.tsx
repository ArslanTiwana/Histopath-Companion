"use client";

import Link from "@/app/components/ActionLink";
import { useCallback, useMemo, useState } from "react";
import { z } from "zod";
import AppNav from "@/app/components/AppNav";
import DictationButton from "@/app/components/DictationButton";
import { useRegisterActions } from "@/app/components/ActionProvider";
import { apiFetch } from "@/lib/api-fetch";
import { defineAction, type AnyAction } from "@/lib/actions";

type Result = {
  id: number;
  caseLabel: string;
  specimenType: string | null;
  status: string;
  diagnosis: string | null;
};

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [error, setError] = useState("");
  const search = useCallback(async (value: string) => {
    setQuery(value);
    setError("");
    try {
      setResults(
        await apiFetch<Result[]>("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: value }),
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Search failed");
    }
  }, []);
  const runtime = useRegisterActions(
    "search",
    useMemo<AnyAction[]>(
      () => [
        defineAction({
          id: "set_search_query",
          description: "Set the private case search text.",
          args: z.object({ query: z.string() }),
          screens: ["search"],
          risk: "safe",
          describe: ({ query: value }) => `Set search to ${value}`,
          run: ({ query: value }) => setQuery(value),
        }),
        defineAction({
          id: "search",
          description: "Search cases without putting search text in the URL.",
          args: z.object({ query: z.string().optional() }),
          screens: ["search"],
          risk: "safe",
          describe: ({ query: value }) => `Search for ${value || query}`,
          run: ({ query: value }) => search(value || query),
        }),
        defineAction({
          id: "open_search_result",
          description: "Open a visible search result by one-based position.",
          args: z.object({ position: z.number().int().min(1).max(20) }),
          screens: ["search"],
          risk: "safe",
          describe: ({ position }) => `Open search result ${position}`,
          run: ({ position }) => {
            const result = results[position - 1];
            if (!result)
              throw new Error("That search result is not available.");
            window.location.href = `/cases/${result.id}`;
          },
        }),
      ],
      [query, results, search],
    ),
    () => ({
      screenId: "search",
      query,
      results: results.map((item, index) => ({
        position: index + 1,
        caseLabel: item.caseLabel,
      })),
    }),
  );
  function voice(text: string) {
    const open = text.match(/open the (first|second|third|fourth|fifth)/i);
    if (open) {
      const position =
        ["first", "second", "third", "fourth", "fifth"].indexOf(
          open[1].toLowerCase(),
        ) + 1;
      void runtime.run("open_search_result", { position }, { source: "voice" });
    } else void runtime.run("search", { query: text }, { source: "voice" });
  }
  return (
    <main className="app-shell">
      <Link data-action="navigate" href="/" className="back">
        ← Worklist
      </Link>
      <div className="eyebrow">BY VOICE OR TEXT</div>
      <h1>Search</h1>
      <form
        className="search-box"
        onSubmit={(event) => {
          event.preventDefault();
          void runtime.run("search", { query });
        }}
      >
        <input
          data-action="set_search_query"
          value={query}
          onChange={(event) =>
            void runtime.run("set_search_query", { query: event.target.value })
          }
          placeholder="Last three breast cases with DCIS"
        />
        <button data-action="search" className="primary">
          Search
        </button>
      </form>
      {query && (
        <section className="spoken-card">
          <div>
            <b>You searched</b>
            <p>“{query}”</p>
          </div>
        </section>
      )}
      <div className="case-list">
        {results.map((item, index) => (
          <Link
            data-action="open_search_result"
            onClick={(event) => {
              event.preventDefault();
              void runtime.run("open_search_result", { position: index + 1 });
            }}
            className="case-row"
            href={`/cases/${item.id}`}
            key={item.id}
          >
            <div>
              <strong>
                {item.caseLabel} · {item.specimenType || "Specimen"}
              </strong>
              <span>{item.diagnosis || "No provisional diagnosis"}</span>
            </div>
            <span className="status-pill">
              {item.status.replaceAll("_", " ")}
            </span>
          </Link>
        ))}
        {query && !results.length && !error && (
          <p className="empty">No matching cases.</p>
        )}
      </div>
      <p className="form-note">Tap a case or say “open the second one”.</p>
      <DictationButton label="Search or open a result" onTranscript={voice} />
      {error && <div className="error">{error}</div>}
      <AppNav active="cases" />
    </main>
  );
}
