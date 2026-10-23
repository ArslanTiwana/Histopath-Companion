"use client";

import { apiFetch } from "./api-fetch";

export type PendingActionResponse = {
  token: string;
  readBackText: string;
  expiresAt: string;
};

export async function prepareAction(
  action: string,
  args: Record<string, unknown>,
) {
  return apiFetch<PendingActionResponse>("/api/actions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "prepare", action, args }),
  });
}

export async function confirmAction<T = unknown>(token: string) {
  return apiFetch<{ action: string; result: T }>("/api/actions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "confirm", token }),
  });
}

export async function cancelAction(token: string) {
  return apiFetch<{ cancelled: boolean }>("/api/actions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "cancel", token }),
  });
}

export async function runConfirmedAction<T = unknown>(
  action: string,
  args: Record<string, unknown>,
) {
  const pending = await prepareAction(action, args);
  return confirmAction<T>(pending.token);
}
