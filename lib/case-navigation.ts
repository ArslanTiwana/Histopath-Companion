import type { CaseStatus } from "@prisma/client";

export type CaseNextAction =
  | { kind: "link"; label: string; href: string }
  | { kind: "send_to_consultant"; label: string };

export function caseNextAction(
  status: CaseStatus,
  caseId: number,
): CaseNextAction {
  const base = `/cases/${caseId}`;
  switch (status) {
    case "gross_pending":
      return {
        kind: "link",
        label: "Start guided gross",
        href: `${base}/gross`,
      };
    case "micro_pending":
      return { kind: "link", label: "Start microscopy", href: `${base}/micro` };
    case "micro_done":
      return { kind: "send_to_consultant", label: "Send to consultant" };
    case "with_consultant":
      return {
        kind: "link",
        label: "Add consultant diagnosis",
        href: `${base}/consultant`,
      };
    case "consultant_dx_added":
      return { kind: "link", label: "Generate report", href: `${base}/report` };
    case "report_draft":
      return { kind: "link", label: "Review report", href: `${base}/report` };
    case "report_approved":
      return {
        kind: "link",
        label: "Send report to typist",
        href: `/typist?caseId=${caseId}`,
      };
    case "with_typist":
    case "needs_confirmation":
      return {
        kind: "link",
        label: "Check typed report",
        href: `${base}/typist`,
      };
    case "delivered":
      return {
        kind: "link",
        label: "View delivered record",
        href: `${base}/delivered`,
      };
  }
}
