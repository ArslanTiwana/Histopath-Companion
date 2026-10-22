import { prisma } from "./db";

export function startOfToday(now = new Date()) {
  const value = new Date(now);
  value.setHours(0, 0, 0, 0);
  return value;
}

export function endOfToday(now = new Date()) {
  const value = startOfToday(now);
  value.setDate(value.getDate() + 1);
  value.setMilliseconds(-1);
  return value;
}

const weekdays = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

export function parseReminderDate(value: string, now = new Date()) {
  const text = value.toLowerCase().trim();
  const result = new Date(now);
  result.setHours(9, 0, 0, 0);
  if (text.includes("tomorrow")) {
    result.setDate(result.getDate() + 1);
    return result;
  }
  const weekday = weekdays.findIndex((day) => text.includes(day));
  if (weekday >= 0) {
    let offset = (weekday - result.getDay() + 7) % 7;
    if (offset === 0) offset = 7;
    result.setDate(result.getDate() + offset);
    return result;
  }
  const iso = text.match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1];
  if (iso) {
    const parsed = new Date(`${iso}T09:00:00`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

export async function getBriefing(now = new Date()) {
  const settings = await prisma.setting.findUnique({ where: { id: 1 } });
  const overdueDays = settings?.overdueDays || 2;
  const reminders = await prisma.reminder.findMany({
    where: { done: false, dueAt: { lte: endOfToday(now) } },
    include: { case: { select: { id: true, caseLabel: true, specimenType: true, status: true } } },
    orderBy: { dueAt: "asc" },
  });
  const consultantCutoff = new Date(now.getTime() - overdueDays * 86_400_000);
  const waitingConsultant = await prisma.case.findMany({
    where: { status: "with_consultant", updatedAt: { lte: consultantCutoff } },
    select: { id: true, caseLabel: true, specimenType: true, status: true, updatedAt: true },
    orderBy: { updatedAt: "asc" },
  });
  const waitingIhc = reminders.filter((reminder) => /\bihc\b/i.test(reminder.text));
  return {
    reminders,
    waitingConsultant,
    waitingIhc: waitingIhc.length,
    summary: `${reminders.length} ${reminders.length === 1 ? "case" : "cases"} to revisit today. ${waitingIhc.length} waiting for IHC, ${waitingConsultant.length} waiting for consultant final.`,
  };
}

export async function getEndOfDay(now = new Date()) {
  const start = startOfToday(now);
  const end = endOfToday(now);
  const [done, reminders, learned, carry] = await Promise.all([
    prisma.case.count({ where: { deliveredAt: { gte: start, lte: end } } }),
    prisma.reminder.findMany({
      where: { done: false },
      include: { case: { select: { id: true, caseLabel: true } } },
      orderBy: { dueAt: "asc" },
    }),
    prisma.consultantEntry.count({ where: { createdAt: { gte: start, lte: end }, learnedNote: { not: null } } }),
    prisma.case.findMany({
      where: { status: { not: "delivered" }, updatedAt: { gte: start, lte: end } },
      select: { id: true, caseLabel: true, status: true },
      orderBy: { updatedAt: "desc" },
      take: 20,
    }),
  ]);
  return { done, revisit: reminders.length, learned, reminders, carry };
}

export async function closeDay(now = new Date()) {
  const summary = await getEndOfDay(now);
  const day = startOfToday(now);
  const counts = {
    done: summary.done,
    revisit: summary.revisit,
    learned: summary.learned,
    carried: summary.carry.length,
  };
  const saved = await prisma.daySummary.upsert({
    where: { day },
    update: { counts, closedAt: now },
    create: { day, counts, closedAt: now },
  });
  await prisma.event.create({
    data: { type: "day_closed", payload: { day: day.toISOString().slice(0, 10), done: summary.done, revisit: summary.revisit, learned: summary.learned } },
  });
  return saved;
}

export async function searchCases(query: string) {
  const numberWord = query.toLowerCase().match(/\blast\s+(\d+|one|two|three|four|five)\b/)?.[1];
  const wordNumbers: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };
  const limit = numberWord ? Number(numberWord) || wordNumbers[numberWord] || 10 : 20;
  const terms = query
    .toLowerCase()
    .replace(/\blast\s+(?:\d+|one|two|three|four|five)\b/g, "")
    .split(/\s+/)
    .filter((term) => term.length > 1 && !["show", "find", "case", "cases", "with", "my", "the"].includes(term));
  const cases = await prisma.case.findMany({
    include: { microEntry: true, consultantEntry: true },
    orderBy: { updatedAt: "desc" },
    take: 250,
  });
  return cases
    .filter((item) => {
      const haystack = [item.caseLabel, item.specimenType || "", item.status, item.microEntry?.provisionalDx || "", item.consultantEntry ? JSON.stringify(item.consultantEntry.consultantDx) : ""].join(" ").toLowerCase();
      return terms.every((term) => haystack.includes(term));
    })
    .slice(0, Math.min(limit, 50))
    .map((item) => ({ id: item.id, caseLabel: item.caseLabel, specimenType: item.specimenType, status: item.status, diagnosis: item.microEntry?.provisionalDx || null }));
}
