import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/lib/ai/config", () => ({
  HISTOPATHOLOGY_VOCABULARY: "histopathology, specimen",
  aiConfig: {
    provider: "groq",
    apiKey: "test-key",
    baseUrl: "https://api.example.test/v1",
    modelStt: "stt-model",
    modelCommands: "command-model",
    modelCommandsFallback: "fallback-model",
    modelChat: "chat-model",
  },
}));

import { chat, runCommand } from "@/src/lib/ai";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AI model routing", () => {
  it("retries an invalid command tool call with the fallback model", async () => {
    const requests: string[] = [];
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as { model: string };
        requests.push(body.model);
        if (body.model === "command-model") {
          return Response.json({ choices: [{ message: {} }] });
        }
        return Response.json({
          choices: [
            {
              message: {
                tool_calls: [
                  {
                    function: {
                      name: "show_pending",
                      arguments: "{}",
                    },
                  },
                ],
              },
            },
          ],
        });
      }),
    );

    const result = await runCommand("show my waiting cases", {
      screen: "worklist",
    });

    expect(requests).toEqual(["command-model", "fallback-model"]);
    expect(result).toMatchObject({ tool: "show_pending" });
    expect(console.info).not.toHaveBeenCalledWith(
      expect.stringContaining("show my waiting cases"),
    );
  });

  it("uses the chat model for chat requests", async () => {
    let requestedModel = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as { model: string };
        requestedModel = body.model;
        return Response.json({
          choices: [{ message: { content: "Short study answer" } }],
        });
      }),
    );

    const result = await chat({
      system: "Study aid only.",
      messages: [{ role: "user", content: "Question" }],
      maxTokens: 80,
    });

    expect(requestedModel).toBe("chat-model");
    expect(result).toBe("Short study answer");
  });
});
