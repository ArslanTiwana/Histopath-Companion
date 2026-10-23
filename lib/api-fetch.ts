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

type ApiFetchOptions = RequestInit & { redirectOn401?: boolean };

export async function apiFetch<T>(
  input: string,
  { redirectOn401 = true, ...init }: ApiFetchOptions = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(input, init);
  } catch {
    throw new ApiFetchError(
      "Network error. Check your connection and try again.",
      "network",
    );
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
    throw new ApiFetchError(message, "http", response.status);
  }
  return data as T;
}
