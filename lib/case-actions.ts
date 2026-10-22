import { prisma } from "./db";
const steps = [
  "gross",
  "micro",
  "consultant",
  "report",
  "typist",
  "delivered",
] as const;
export function rangeLabels(start: string, end: string): string[] {
  const a = Number(start.match(/\d+/)?.[0]);
  const b = Number(end.match(/\d+/)?.[0]);
  if (!Number.isInteger(a) || !Number.isInteger(b) || b < a || b - a > 500)
    throw new Error("Use a valid case range");
  return Array.from({ length: b - a + 1 }, (_, i) => `S-${a + i}`);
}
export async function createSingleCase(
  label: string,
  specimen?: string,
  priority: "routine" | "urgent" = "routine",
) {
  return prisma.case.create({
    data: {
      caseLabel: label,
      specimenType: specimen || null,
      priority,
      steps: { create: steps.map((step) => ({ step })) },
      events: {
        create: { type: "case_created", payload: { source: "voice" } },
      },
    },
  });
}
export async function createBatch(name: string, start: string, end: string) {
  const labels = rangeLabels(start, end);
  const existing = await prisma.case.findMany({
    where: { caseLabel: { in: labels } },
    select: { caseLabel: true },
  });
  if (existing.length)
    throw new Error(
      `Duplicate case labels: ${existing.map((x) => x.caseLabel).join(", ")}`,
    );
  return prisma.batch.create({
    data: {
      name,
      rangeStart: labels[0],
      rangeEnd: labels.at(-1)!,
      count: labels.length,
      cases: {
        create: labels.map((caseLabel) => ({
          caseLabel,
          steps: { create: steps.map((step) => ({ step })) },
          events: {
            create: { type: "case_created", payload: { source: "voice" } },
          },
        })),
      },
    },
    include: { cases: true },
  });
}
