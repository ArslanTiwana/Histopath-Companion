"use client";

import Link from "@/app/components/ActionLink";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import AppNav from "@/app/components/AppNav";
import { useRegisterActions } from "@/app/components/ActionProvider";
import { defineAction, type AnyAction } from "@/lib/actions";
import { apiFetch } from "@/lib/api-fetch";
import { caseMatchesFilter, type CaseListFilter } from "@/lib/case-filters";

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
  const [error, setError] = useState("");
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
    ],
    [],
  );
  const actions = useRegisterActions("cases", screenActions, () => ({
    screenId: "cases",
    filter,
    visibleCases: shown?.map((item) => item.caseLabel) || [],
  }));
  useEffect(() => {
    apiFetch<CaseItem[]>("/api/cases")
      .then(setCases)
      .catch((cause) =>
        setError(
          cause instanceof Error ? cause.message : "Could not load cases",
        ),
      );
  }, []);
  const shown = useMemo(
    () => cases.filter((item) => caseMatchesFilter(item.status, filter)),
    [cases, filter],
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
                {item.specimenType || "Specimen not set"} ·{" "}
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
        {!shown.length && <p className="empty">No cases in this group.</p>}
      </div>
      {error && <div className="error">{error}</div>}
      <AppNav active="cases" />
    </main>
  );
}
