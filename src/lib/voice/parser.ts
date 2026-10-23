export function normalizeCaseLabel(value: string): string | null {
  const cleaned = value
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  const numeric = cleaned.match(/^s\s*-?\s*(\d+)$/);
  if (numeric) return `S-${numeric[1]}`;
  const words: Record<string, string> = {
    zero: "0",
    oh: "0",
    one: "1",
    two: "2",
    three: "3",
    four: "4",
    five: "5",
    six: "6",
    seven: "7",
    eight: "8",
    nine: "9",
  };
  const spoken = cleaned.match(/^s(?:\s*-?\s+)(.+)$/);
  if (!spoken) return null;
  const digits = spoken[1]
    .split(/\s+/)
    .map((word) => words[word])
    .join("");
  return /^\d+$/.test(digits) ? `S-${digits}` : null;
}
export function parseRange(
  value: string,
): { start: string; end: string } | null {
  const match = value.match(
    /(S\s*-?\s*[\w\s]+?)\s+(?:to|through|until|[-–—])\s+(S\s*-?\s*[\w\s]+)$/i,
  );
  if (!match) return null;
  const start = normalizeCaseLabel(match[1]);
  const end = normalizeCaseLabel(match[2]);
  return start && end ? { start, end } : null;
}
export type FastPath = {
  tool: string;
  args: Record<string, unknown>;
  reply: string;
  needsConfirm: boolean;
} | null;

function labelIn(text: string): string | null {
  const numeric = text.match(/\bs\s*-?\s*\d+\b/i);
  if (numeric) return normalizeCaseLabel(numeric[0]);
  const spoken = text.match(
    /\bs\s+(?:(?:zero|oh|one|two|three|four|five|six|seven|eight|nine)\s*)+/i,
  );
  return spoken ? normalizeCaseLabel(spoken[0]) : null;
}

export function matchFastPath(transcript: string): FastPath {
  const text = transcript.toLowerCase().trim();
  const range = parseRange(transcript);
  if (/\bsend\b.+\bto consultant\b/.test(text))
    return {
      tool: "send_to_consultant",
      args: range ? { start: range.start, end: range.end } : {},
      reply: range
        ? `Preparing ${range.start} to ${range.end} for consultant.`
        : "Which case range should I send to the consultant?",
      needsConfirm: false,
    };
  if (/\b(?:new|create|add)\s+(?:a\s+)?batch\b/.test(text))
    return {
      tool: "create_batch",
      args: range ? { start: range.start, end: range.end } : {},
      reply: range
        ? `Preparing ${range.start} to ${range.end}.`
        : "What case range should I create, for example S-101 to S-140?",
      needsConfirm: false,
    };
  if (/\b(?:new|create|add)\s+(?:a\s+)?(?:new\s+)?case\b/.test(text)) {
    const label = labelIn(transcript);
    const specimen = [
      "appendix",
      "gallbladder",
      "skin ellipse",
      "colon",
      "breast",
      "prostate",
    ].find((value) => text.includes(value));
    return {
      tool: "create_case",
      args: {
        ...(label ? { label } : {}),
        ...(specimen
          ? {
              specimen: specimen.replace(/\b\w/g, (letter) =>
                letter.toUpperCase(),
              ),
            }
          : {}),
        priority: text.includes("urgent") ? "urgent" : "routine",
      },
      reply: label
        ? `Preparing ${label}.`
        : "Tell me the case label, specimen, and whether it is routine or urgent.",
      needsConfirm: false,
    };
  }
  if (/^(next case|next)$/.test(text))
    return {
      tool: "next_case",
      args: {},
      reply: "Opening the next pending case.",
      needsConfirm: false,
    };
  if (/^(show pending|pending cases)$/.test(text))
    return {
      tool: "show_pending",
      args: {},
      reply: "Showing pending cases.",
      needsConfirm: false,
    };
  if (/^(show incomplete|incomplete cases)$/.test(text))
    return {
      tool: "show_incomplete",
      args: {},
      reply: "Showing incomplete cases.",
      needsConfirm: false,
    };
  const open = text.match(/^open case\s+(.+)$/);
  if (open)
    return {
      tool: "open_case",
      args: { label: labelIn(open[1]) || open[1] },
      reply: "Opening that case.",
      needsConfirm: false,
    };
  if (/^(go back|back)$/.test(text))
    return {
      tool: "go_back",
      args: {},
      reply: "Going back.",
      needsConfirm: false,
    };
  if (/^(open worklist|worklist|home)$/.test(text))
    return {
      tool: "open_worklist",
      args: {},
      reply: "Opening the worklist.",
      needsConfirm: false,
    };
  if (/^(confirm|yes|save)$/.test(text))
    return {
      tool: "confirm",
      args: {},
      reply: "Confirming the pending action.",
      needsConfirm: false,
    };
  if (/^(cancel|no|stop)$/.test(text))
    return {
      tool: "cancel",
      args: {},
      reply: "Cancelled.",
      needsConfirm: false,
    };
  if (/^(undo|undo last)$/.test(text))
    return {
      tool: "undo_last",
      args: {},
      reply: "Undoing the last safe action.",
      needsConfirm: false,
    };
  return null;
}

export function matchRegistryFastPath(transcript: string): FastPath {
  const matched = matchFastPath(transcript);
  if (!matched) return null;
  const mapped: Record<
    string,
    { tool: string; args?: Record<string, unknown> }
  > = {
    open_worklist: { tool: "navigate", args: { to: "/" } },
    show_pending: { tool: "set_filter", args: { filter: "pending" } },
    show_incomplete: { tool: "set_filter", args: { filter: "incomplete" } },
  };
  const replacement = mapped[matched.tool];
  return replacement
    ? {
        ...matched,
        tool: replacement.tool,
        args: replacement.args || matched.args,
      }
    : matched;
}
