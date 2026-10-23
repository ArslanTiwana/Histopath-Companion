export type CaseListFilter = "started" | "not_started" | "completed";

export function caseMatchesFilter(status: string, filter: CaseListFilter) {
  if (filter === "not_started") return status === "gross_pending";
  if (filter === "completed") return status === "delivered";
  return status !== "gross_pending" && status !== "delivered";
}
