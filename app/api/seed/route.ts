import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isAuthenticated } from "@/lib/auth";
export async function POST() {
  if (!(await isAuthenticated()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const labels = [
    "S-101",
    "S-102",
    "S-103",
    "S-104",
    "S-105",
    "S-106",
    "S-107",
    "S-108",
    "S-109",
    "S-110",
  ];
  for (let i = 0; i < labels.length; i += 1) {
    const caseLabel = labels[i];
    await prisma.case.upsert({
      where: { caseLabel },
      update: {},
      create: {
        caseLabel,
        specimenType: ["Appendix", "Gallbladder", "Skin ellipse"][i % 3],
        priority: i === 2 ? "urgent" : "routine",
        steps: {
          create: [
            "gross",
            "micro",
            "consultant",
            "report",
            "typist",
            "delivered",
          ].map((step) => ({ step: step as never })),
        },
        events: {
          create: { type: "case_created", payload: { source: "seed" } },
        },
      },
    });
  }
  return NextResponse.json({ ok: true });
}
