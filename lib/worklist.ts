export type WorklistCase = {
  id: number;
  status: string;
};

export function nextGrossCase<T extends WorklistCase>(visibleCases: T[]) {
  return visibleCases.find((item) => item.status === "gross_pending") || null;
}

export function readyConsultantCaseIds(cases: WorklistCase[]) {
  return cases
    .filter((item) => item.status === "micro_done")
    .map((item) => item.id);
}
