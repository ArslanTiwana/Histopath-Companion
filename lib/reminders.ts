const reminderWeekdays = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

export function parseReminderCommand(value: string) {
  const match = value.trim().match(/^remind me\s+(.+?)\s+to\s+(.+)$/i);
  if (!match) return null;
  const when =
    reminderWeekdays.find((day) => match[1].toLowerCase().includes(day)) ||
    (match[1].toLowerCase().includes("tomorrow")
      ? "tomorrow"
      : match[1].trim());
  const text = match[2].trim();
  const label =
    text
      .match(/\bS\s*-?\s*\d+\b/i)?.[0]
      ?.replace(/\s+/g, "")
      .replace(/^s/i, "S")
      .replace(/^S(?!-)/, "S-") || null;
  return { when, text, label };
}
