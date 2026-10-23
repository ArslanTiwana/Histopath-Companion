const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const steps = ["gross", "micro", "consultant", "report", "typist", "delivered"];
async function main() {
  const starterTemplates = [
    "appendix",
    "gallbladder",
    "skin-ellipse",
    "colon",
    "breast",
    "prostate",
  ];
  for (const specimenType of starterTemplates) {
    const schema = {
      fields: [
        {
          key: "description",
          label: "Description",
          type: "text",
          unit: "",
          defaultText: "",
        },
      ],
    };
    await prisma.template.upsert({
      where: { kind_specimenType: { kind: "gross", specimenType } },
      update: {},
      create: {
        kind: "gross",
        specimenType,
        schema,
        defaultText: `${specimenType.replaceAll("-", " ")} specimen.`,
      },
    });
    await prisma.template.upsert({
      where: { kind_specimenType: { kind: "report", specimenType } },
      update: {},
      create: {
        kind: "report",
        specimenType,
        schema: {
          fields: [
            "specimen",
            "gross",
            "microscopy",
            "diagnosis",
            "grade",
            "stage",
            "margins",
            "laterality",
            "tumourSize",
          ],
        },
        defaultText: null,
      },
    });
  }
  const labels = Array.from({ length: 10 }, (_, i) => `S-${101 + i}`);
  for (let i = 0; i < labels.length; i += 1)
    await prisma.case.upsert({
      where: { caseLabel: labels[i] },
      update: {},
      create: {
        caseLabel: labels[i],
        specimenType: ["appendix", "gallbladder", "skin-ellipse"][i % 3],
        priority: i === 2 ? "urgent" : "routine",
        steps: { create: steps.map((step) => ({ step })) },
        events: {
          create: { type: "case_created", payload: { source: "seed" } },
        },
      },
    });
}
main().finally(() => prisma.$disconnect());
