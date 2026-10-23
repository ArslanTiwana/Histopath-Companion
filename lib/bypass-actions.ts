import { z } from "zod";
import type { CaseStatus, StepName } from "@prisma/client";
import { prisma } from "./db";
import { transitionCase } from "./status";

export const bypassStepSchema = z.object({
  caseId: z.number().int().positive(),
  step: z.enum(["gross", "micro", "consultant", "report", "typist"]),
  mode: z.enum(["skip", "force"]),
  reason: z.string().trim().min(3, "A reason is required").max(1000),
});

const stageForStep: Record<
  z.infer<typeof bypassStepSchema>["step"],
  { from: CaseStatus; to: CaseStatus }
> = {
  gross: { from: "gross_pending", to: "micro_pending" },
  micro: { from: "micro_pending", to: "micro_done" },
  consultant: { from: "with_consultant", to: "consultant_dx_added" },
  report: { from: "report_draft", to: "report_approved" },
  typist: { from: "with_typist", to: "needs_confirmation" },
};

export async function bypassStep(
  caseId: number,
  step: StepName,
  mode: "skip" | "force",
  reason: string,
) {
  const input = bypassStepSchema.parse({ caseId, step, mode, reason });
  const stage = stageForStep[input.step];
  const stepStatus = input.mode === "skip" ? "skipped" : "forced";
  return prisma.$transaction(async (tx) => {
    if (input.step === "report") {
      const report = await tx.report.findUnique({ where: { caseId } });
      if (!report) throw new Error("Generate the report before bypassing it");
      await tx.report.update({
        where: { caseId },
        data: { status: stepStatus },
      });
    }
    return transitionCase(
      {
        caseId,
        from: stage.from,
        to: stage.to,
        steps: [{ step: input.step, status: stepStatus, reason: input.reason }],
        incomplete: true,
        event: {
          type: `${input.step}_${stepStatus}`,
          payload: { reason: input.reason, confirmed: true },
        },
        statusPayload: { incomplete: true },
      },
      tx,
    );
  });
}
