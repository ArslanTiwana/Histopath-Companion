export type AttentionCase = {
  priority: string;
  incomplete: boolean;
  status: string;
  updatedAt: string | Date;
  reminders?: Array<{ done: boolean }>;
  typistChecks?: Array<{ result: string }>;
};

export function attentionReasons(
  item: AttentionCase,
  overdueDays: number,
  now = new Date(),
) {
  const reasons: string[] = [];
  if (item.priority === "urgent" && item.status !== "delivered")
    reasons.push("urgent");
  if (item.incomplete) reasons.push("incomplete");
  if (
    item.status !== "delivered" &&
    new Date(item.updatedAt).getTime() <=
      now.getTime() - overdueDays * 86_400_000
  )
    reasons.push("overdue");
  if (item.reminders?.some((reminder) => !reminder.done))
    reasons.push("revisit");
  if (item.typistChecks?.[0]?.result === "returned")
    reasons.push("typist returned");
  return reasons;
}
