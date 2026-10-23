"use client";

export type ApiErrorKind = "unauthorized" | "http" | "network";

export class ApiFetchError extends Error {
  constructor(
    message: string,
    public readonly kind: ApiErrorKind,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "ApiFetchError";
  }
}

type ApiFetchOptions = RequestInit & {
  redirectOn401?: boolean;
  timeoutMs?: number;
};

function reportRequestError(error: ApiFetchError) {
  if (typeof window === "undefined" || error.kind === "unauthorized") return;
  window.dispatchEvent(
    new CustomEvent("app-request-error", {
      detail: { message: error.message, status: error.status },
    }),
  );
}

export async function apiFetch<T>(
  input: string,
  { redirectOn401 = true, timeoutMs = 15000, ...init }: ApiFetchOptions = {},
): Promise<T> {
  let response: Response;
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  const abortFromCaller = () => controller.abort();
  init.signal?.addEventListener("abort", abortFromCaller, { once: true });
  try {
    response = await fetch(input, { ...init, signal: controller.signal });
  } catch {
    const error = new ApiFetchError(
      controller.signal.aborted && !init.signal?.aborted
        ? "This is taking too long. Check your connection and try again."
        : "Network error. Check your connection and try again.",
      "network",
    );
    reportRequestError(error);
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
    init.signal?.removeEventListener("abort", abortFromCaller);
  }
  let data: unknown = null;
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  }
  if (response.status === 401) {
    if (redirectOn401 && typeof window !== "undefined")
      window.location.assign("/");
    throw new ApiFetchError("Your session has expired.", "unauthorized", 401);
  }
  if (!response.ok) {
    const message =
      data &&
      typeof data === "object" &&
      "error" in data &&
      typeof data.error === "string"
        ? data.error
        : `Request failed (${response.status}).`;
    const error = new ApiFetchError(message, "http", response.status);
    reportRequestError(error);
    throw error;
  }
  return data as T;
}
