import { z } from "zod";
import { aiConfig, HISTOPATHOLOGY_VOCABULARY } from "./config";
import {
  ACTION_ROUTER_SYSTEM_PROMPT,
  buildActionRouterTools,
  estimateRouterStaticTokens,
} from "@/lib/action-router";
import type { RouterAction, RouterActionCall, RouterContext } from "./types";

export class AiBusyError extends Error {
  constructor() {
    super("The voice service is busy. Please try again.");
    this.name = "AiBusyError";
  }
}

const commandNames = [
  "open_worklist",
  "open_case",
  "next_case",
  "create_batch",
  "create_case",
  "show_pending",
  "show_stuck",
  "show_incomplete",
  "confirm",
  "cancel",
  "undo_last",
  "go_back",
  "send_to_consultant",
] as const;
const commandResultSchema = z.object({
  tool: z.enum(commandNames),
  args: z.record(z.string(), z.unknown()),
  reply: z.string(),
  needsConfirm: z.boolean(),
});

export type CommandResult = z.infer<typeof commandResultSchema>;
export type CommandContext = { screen: string; caseId?: number };
export type ChatMessage = { role: "user" | "assistant"; content: string };

export type { RouterAction, RouterActionCall, RouterContext } from "./types";

const ROUTER_SYSTEM_PROMPT =
  "Route a histopathology worklist command. Use one provided tool. Never invent missing arguments; ask a short clarifying question instead. Never include patient details.";
const CLARIFYING_RESPONSE = {
  reply: "I need a little more detail. What should I do?",
  needsConfirm: false,
} as const;

const toolByName = Object.fromEntries(
  commandNames.map((name) => [
    name,
    {
      type: "function",
      function: {
        name,
        description: `Run the ${name} worklist action.`,
        parameters: {
          type: "object",
          properties:
            name === "open_case"
              ? { label: { type: "string" } }
              : name === "create_batch"
                ? {
                    name: { type: "string" },
                    start: { type: "string" },
                    end: { type: "string" },
                  }
                : name === "create_case"
                  ? {
                      label: { type: "string" },
                      specimen: { type: "string" },
                      priority: { type: "string", enum: ["routine", "urgent"] },
                    }
                  : name === "send_to_consultant"
                    ? {
                        start: { type: "string" },
                        end: { type: "string" },
                      }
                    : name === "show_stuck"
                      ? { days: { type: "integer", minimum: 1 } }
                      : {},
          additionalProperties: false,
        },
      },
    },
  ]),
) as Record<string, object>;

function toolsForScreen(screen: string): object[] {
  const common = [
    "open_worklist",
    "open_case",
    "go_back",
    "confirm",
    "cancel",
    "undo_last",
  ];
  const worklist = [
    "next_case",
    "create_batch",
    "create_case",
    "show_pending",
    "show_stuck",
    "show_incomplete",
    "send_to_consultant",
  ];
  return (screen === "worklist" ? [...common, ...worklist] : common).map(
    (name) => toolByName[name],
  );
}

function retryDelayMs(response: Response): number {
  const value = response.headers.get("retry-after");
  if (!value) return 350;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? 350 : Math.max(0, date - Date.now());
}

async function withRateLimitRetry<T>(
  request: () => Promise<Response>,
  parse: (response: Response) => Promise<T>,
): Promise<T> {
  let response = await request();
  if (response.status === 429) {
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs(response)));
    response = await request();
  }
  if (response.status === 429) throw new AiBusyError();
  if (!response.ok) throw new Error(`AI request failed (${response.status})`);
  return parse(response);
}

const authorizationHeaders = () => ({
  Authorization: `Bearer ${aiConfig.apiKey}`,
  "Content-Type": "application/json",
});

export async function transcribe(audio: Blob): Promise<string> {
  const body = new FormData();
  body.append("file", audio, "voice.webm");
  body.append("model", aiConfig.modelStt);
  body.append("prompt", HISTOPATHOLOGY_VOCABULARY);
  body.append("response_format", "json");
  return withRateLimitRetry(
    () =>
      fetch(`${aiConfig.baseUrl}/audio/transcriptions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${aiConfig.apiKey}` },
        body,
      }),
    async (response) => {
      const data = (await response.json()) as { text?: string };
      return data.text?.trim() || "";
    },
  );
}

async function requestCommand(
  model: string,
  transcript: string,
  context: CommandContext,
): Promise<CommandResult | null> {
  const data = await withRateLimitRetry(
    () =>
      fetch(`${aiConfig.baseUrl}/chat/completions`, {
        method: "POST",
        headers: authorizationHeaders(),
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: ROUTER_SYSTEM_PROMPT },
            {
              role: "user",
              content: `Screen: ${context.screen}${context.caseId ? `; case ID: ${context.caseId}` : ""}`,
            },
            { role: "user", content: transcript },
          ],
          tools: toolsForScreen(context.screen),
          tool_choice: "auto",
          temperature: 0,
          max_completion_tokens: 160,
        }),
      }),
    async (response) =>
      (await response.json()) as {
        choices?: Array<{
          message?: {
            tool_calls?: Array<{
              function?: { name?: string; arguments?: string };
            }>;
          };
        }>;
      },
  );
  const call = data.choices?.[0]?.message?.tool_calls?.[0]?.function;
  if (!call?.name || !call.arguments) return null;
  try {
    const parsed = commandResultSchema.safeParse({
      tool: call.name,
      args: JSON.parse(call.arguments) as unknown,
      reply: `Running ${call.name.replaceAll("_", " ")}.`,
      needsConfirm: call.name === "create_batch" || call.name === "create_case",
    });
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function runCommand(
  transcript: string,
  context: CommandContext,
): Promise<CommandResult | typeof CLARIFYING_RESPONSE> {
  const primary = await requestCommand(
    aiConfig.modelCommands,
    transcript,
    context,
  );
  if (primary) {
    console.info(
      `[ai.command] provider=${aiConfig.provider} model=${aiConfig.modelCommands} outcome=handled`,
    );
    return primary;
  }
  console.info(
    `[ai.command] provider=${aiConfig.provider} model=${aiConfig.modelCommands} outcome=invalid_tool_call`,
  );
  if (aiConfig.modelCommandsFallback) {
    const fallback = await requestCommand(
      aiConfig.modelCommandsFallback,
      transcript,
      context,
    );
    if (fallback) {
      console.info(
        `[ai.command] provider=${aiConfig.provider} model=${aiConfig.modelCommandsFallback} outcome=handled`,
      );
      return fallback;
    }
    console.info(
      `[ai.command] provider=${aiConfig.provider} model=${aiConfig.modelCommandsFallback} outcome=invalid_tool_call`,
    );
  }
  return CLARIFYING_RESPONSE;
}

export async function runActionRouter(
  transcript: string,
  context: RouterContext,
): Promise<{ calls: RouterActionCall[]; reply: string }> {
  const actions = context.actions.slice(0, 24);
  if (estimateRouterStaticTokens(actions) > 1_000)
    throw new Error("The current action registry exceeds the router budget.");
  const tools = buildActionRouterTools(actions);
  const compactState = JSON.stringify(context.screenState).slice(0, 1_200);
  const compactTurns = context.lastTurns.slice(-3).join("\n").slice(0, 500);
  const data = await withRateLimitRetry(
    () =>
      fetch(`${aiConfig.baseUrl}/chat/completions`, {
        method: "POST",
        headers: authorizationHeaders(),
        body: JSON.stringify({
          model: aiConfig.modelCommands,
          messages: [
            { role: "system", content: ACTION_ROUTER_SYSTEM_PROMPT },
            {
              role: "user",
              content: `screen=${context.screenId}; state=${compactState}; recent=${compactTurns}`,
            },
            { role: "user", content: transcript },
          ],
          tools,
          tool_choice: "auto",
          temperature: 0,
          max_completion_tokens: 180,
        }),
      }),
    async (response) =>
      (await response.json()) as {
        choices?: Array<{
          message?: {
            content?: string;
            tool_calls?: Array<{
              function?: { name?: string; arguments?: string };
            }>;
          };
        }>;
      },
  );
  const message = data.choices?.[0]?.message;
  const allowed = new Set(actions.map((action) => action.id));
  const calls: RouterActionCall[] = [];
  for (const toolCall of message?.tool_calls || []) {
    const call = toolCall.function;
    if (!call?.name || !allowed.has(call.name) || calls.length === 3) continue;
    try {
      const args = JSON.parse(call.arguments || "{}") as unknown;
      if (args && typeof args === "object" && !Array.isArray(args))
        calls.push({ id: call.name, args: args as Record<string, unknown> });
    } catch {
      continue;
    }
  }
  return {
    calls,
    reply:
      message?.content?.trim() ||
      (calls.length
        ? `Running ${calls.map((call) => call.id.replaceAll("_", " ")).join(", ")}.`
        : "I need a little more detail."),
  };
}

export async function chat({
  system,
  messages,
  maxTokens,
}: {
  system: string;
  messages: ChatMessage[];
  maxTokens: number;
}): Promise<string> {
  return withRateLimitRetry(
    () =>
      fetch(`${aiConfig.baseUrl}/chat/completions`, {
        method: "POST",
        headers: authorizationHeaders(),
        body: JSON.stringify({
          model: aiConfig.modelChat,
          messages: [{ role: "system", content: system }, ...messages],
          max_completion_tokens: maxTokens,
        }),
      }),
    async (response) => {
      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      return data.choices?.[0]?.message?.content?.trim() || "";
    },
  );
}
