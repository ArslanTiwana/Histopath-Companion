const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const steps = ["gross", "micro", "consultant", "report", "typist", "delivered"];
async function main() {
  const labels = Array.from({ length: 10 }, (_, i) => `S-${101 + i}`);
  for (let i = 0; i < labels.length; i += 1)
    await prisma.case.upsert({
      where: { caseLabel: labels[i] },
      update: {},
      create: {
        caseLabel: labels[i],
        specimenType: ["Appendix", "Gallbladder", "Skin ellipse"][i % 3],
        priority: i === 2 ? "urgent" : "routine",
        steps: { create: steps.map((step) => ({ step })) },
        events: {
          create: { type: "case_created", payload: { source: "seed" } },
        },
      },
    });
}
main().finally(() => prisma.$disconnect());
