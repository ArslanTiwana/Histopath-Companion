import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch, ApiFetchError } from "@/lib/api-fetch";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apiFetch", () => {
  it("returns typed JSON for successful requests", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ value: 3 })),
    );
    await expect(apiFetch<{ value: number }>("/api/test")).resolves.toEqual({
      value: 3,
    });
  });

  it("throws the API message for a non-2xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ error: "Invalid request" }, { status: 400 }),
      ),
    );
    await expect(apiFetch("/api/test")).rejects.toMatchObject({
      name: "ApiFetchError",
      kind: "http",
      message: "Invalid request",
    });
  });

  it("distinguishes network failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("offline");
      }),
    );
    await expect(apiFetch("/api/test")).rejects.toBeInstanceOf(ApiFetchError);
    await expect(apiFetch("/api/test")).rejects.toMatchObject({
      kind: "network",
    });
  });

  it("bounds requests so a screen cannot wait forever", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            );
          }),
      ),
    );
    await expect(apiFetch("/api/test", { timeoutMs: 5 })).rejects.toMatchObject(
      {
        kind: "network",
        message: expect.stringContaining("taking too long"),
      },
    );
  });
});
