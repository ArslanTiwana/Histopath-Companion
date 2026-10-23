"use client";

import Link from "@/app/components/ActionLink";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import AppNav from "@/app/components/AppNav";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/app/components/ScreenState";
import { useRegisterActions } from "@/app/components/ActionProvider";
import { defineAction, type AnyAction } from "@/lib/actions";
import { apiFetch } from "@/lib/api-fetch";
import { caseMatchesFilter, type CaseListFilter } from "@/lib/case-filters";
import { specimenName } from "@/lib/specimens";

type CaseItem = {
  id: number;
  caseLabel: string;
  specimenType: string | null;
  priority: "routine" | "urgent";
  status: string;
  incomplete: boolean;
  batch?: { name: string } | null;
};

const tabs: { value: CaseListFilter; label: string }[] = [
  { value: "started", label: "Started" },
  { value: "not_started", label: "Not started" },
  { value: "completed", label: "Completed" },
];

export default function CasesPage() {
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [filter, setFilter] = useState<CaseListFilter>("started");
  const [search, setSearch] = useState("");
  const [batch, setBatch] = useState("all");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const screenActions = useMemo<AnyAction[]>(
    () => [
      defineAction({
        id: "set_cases_filter",
        description: "Show started, not started, or completed cases.",
        args: z.object({
          filter: z.enum(["started", "not_started", "completed"]),
        }),
        screens: ["cases"],
        risk: "safe",
        describe: ({ filter }) => `Show ${filter.replace("_", " ")} cases`,
        run: ({ filter }) => setFilter(filter),
      }),
      defineAction({
        id: "search_cases_list",
        description: "Search the all-cases list.",
        args: z.object({ query: z.string() }),
        screens: ["cases"],
        risk: "safe",
        describe: ({ query }) => `Search cases for ${query}`,
        run: ({ query }) => setSearch(query),
      }),
      defineAction({
        id: "set_cases_batch_filter",
        description: "Filter all cases by batch.",
        args: z.object({ batch: z.string() }),
        screens: ["cases"],
        risk: "safe",
        describe: ({ batch }) => `Show batch ${batch}`,
        run: ({ batch }) => setBatch(batch),
      }),
    ],
    [],
  );
  const actions = useRegisterActions("cases", screenActions, () => ({
    screenId: "cases",
    filter,
    search,
    batch,
    visibleCases: shown?.map((item) => item.caseLabel) || [],
  }));
  useEffect(() => {
    apiFetch<CaseItem[]>("/api/cases")
      .then(setCases)
      .catch((cause) =>
        setError(
          cause instanceof Error ? cause.message : "Could not load cases",
        ),
      )
      .finally(() => setLoading(false));
  }, []);
  const batches = useMemo(
    () =>
      Array.from(
        new Set(
          cases
            .map((item) => item.batch?.name)
            .filter((value): value is string => Boolean(value)),
        ),
      ),
    [cases],
  );
  const shown = useMemo(
    () =>
      cases.filter((item) => {
        const term = search.trim().toLowerCase();
        return (
          caseMatchesFilter(item.status, filter) &&
          (batch === "all" ||
            (batch === "single" ? !item.batch : item.batch?.name === batch)) &&
          (!term ||
            [
              item.caseLabel,
              item.specimenType || "",
              item.status,
              item.batch?.name || "",
            ].some((value) => value.toLowerCase().includes(term)))
        );
      }),
    [batch, cases, filter, search],
  );

  if (loading)
    return (
      <main className="app-shell">
        <LoadingState label="Loading cases" />
      </main>
    );
  if (error && !cases.length)
    return (
      <main className="app-shell">
        <ErrorState detail={error} />
        <AppNav active="cases" />
      </main>
    );

  return (
    <main className="app-shell">
      <header>
        <div>
          <div className="eyebrow">ALL CASES</div>
          <h1>Cases</h1>
        </div>
        <span className="status-pill">{shown.length}</span>
      </header>
      <div className="chips">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            data-action="set_cases_filter"
            className={filter === tab.value ? "chip active" : "chip"}
            onClick={() =>
              void actions.run("set_cases_filter", { filter: tab.value })
            }
          >
            {tab.label} ·{" "}
            {
              cases.filter((item) => caseMatchesFilter(item.status, tab.value))
                .length
            }
          </button>
        ))}
      </div>
      <div className="form-stack">
        <input
          data-action="search_cases_list"
          value={search}
          placeholder="Search case, specimen or status"
          onChange={(event) =>
            void actions.run("search_cases_list", { query: event.target.value })
          }
        />
        <select
          data-action="set_cases_batch_filter"
          value={batch}
          onChange={(event) =>
            void actions.run("set_cases_batch_filter", {
              batch: event.target.value,
            })
          }
        >
          <option value="all">All batches and singles</option>
          <option value="single">Single cases</option>
          {batches.map((name) => (
            <option value={name} key={name}>
              {name}
            </option>
          ))}
        </select>
      </div>
      <div className="case-list">
        {shown.map((item) => (
          <Link
            data-action="navigate"
            onClick={(event) => {
              event.preventDefault();
              void actions.run("navigate", { to: `/cases/${item.id}` });
            }}
            href={`/cases/${item.id}`}
            className="case-row"
            key={item.id}
          >
            <div>
              <strong>{item.caseLabel}</strong>
              <span>
                {specimenName(item.specimenType)} ·{" "}
                {item.batch?.name || "Single case"}
              </span>
            </div>
            <div className="row-right">
              {item.incomplete && (
                <span className="incomplete">Incomplete</span>
              )}
              <b>{item.status.replaceAll("_", " ")}</b>
              <span>›</span>
            </div>
          </Link>
        ))}
        {!shown.length && (
          <EmptyState
            title="No cases in this group"
            detail="Change the status, batch or search filter to see other cases."
          />
        )}
      </div>
      {error && <div className="error">{error}</div>}
      <AppNav active="cases" />
    </main>
  );
}
