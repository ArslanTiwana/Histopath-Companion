"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";
import type { AnyAction, ActionContext, ActionManifest } from "@/lib/actions";
import { actionManifest, ActionRegistry } from "@/lib/actions";
import { apiFetch } from "@/lib/api-fetch";

type ScreenRegistration = {
  actions: AnyAction[];
  getScreenState: () => Record<string, unknown>;
};

type ActionRuntime = {
  register: (
    screenId: string,
    actions: AnyAction[],
    getScreenState: () => Record<string, unknown>,
  ) => () => void;
  run: (id: string, args?: unknown, ctx?: ActionContext) => Promise<unknown>;
  routerContext: () => {
    screenId: string;
    screenState: Record<string, unknown>;
    actions: ActionManifest[];
    dictationTarget?: string | null;
  };
};

const ActionContextValue = createContext<ActionRuntime | null>(null);

export function ActionProvider({ children }: { children: React.ReactNode }) {
  const registry = useMemo(() => new ActionRegistry(), []);
  const screensRef = useRef(new Map<string, ScreenRegistration[]>());
  const activeScreenRef = useRef("global");

  const register = useCallback(
    (
      screenId: string,
      actions: AnyAction[],
      getScreenState: () => Record<string, unknown>,
    ) => {
      const unregister = registry.register(actions);
      const registrations = screensRef.current.get(screenId) || [];
      const registration = { actions, getScreenState };
      screensRef.current.set(screenId, [...registrations, registration]);
      if (screenId !== "global") activeScreenRef.current = screenId;
      return () => {
        unregister();
        const remainingForScreen = (
          screensRef.current.get(screenId) || []
        ).filter((value) => value !== registration);
        if (remainingForScreen.length)
          screensRef.current.set(screenId, remainingForScreen);
        else screensRef.current.delete(screenId);
        if (activeScreenRef.current === screenId) {
          const remaining = Array.from(screensRef.current.keys()).filter(
            (value) => value !== "global",
          );
          activeScreenRef.current = remaining.at(-1) || "global";
        }
      };
    },
    [registry],
  );

  const run = useCallback(
    async (
      id: string,
      args: unknown = {},
      ctx: ActionContext = { source: "tap" },
    ) => {
      const action = registry.get(id);
      if (!action)
        throw new Error(`Action ${id} is not available on this screen.`);
      const parsed = action.args.safeParse(args);
      if (!parsed.success)
        throw new Error(
          parsed.error.issues[0]?.message || `Invalid arguments for ${id}.`,
        );
      if (
        ctx.source === "voice" &&
        action.risk === "confirm" &&
        !ctx.confirmed
      ) {
        return apiFetch<{
          token: string;
          readBackText: string;
          expiresAt: string;
        }>("/api/actions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "prepare_client",
            action: id,
            args: parsed.data,
            readBackText: action.describe(parsed.data as never),
          }),
        });
      }
      return registry.run(id, parsed.data, ctx);
    },
    [registry],
  );

  const routerContext = useCallback(() => {
    const screenId = activeScreenRef.current;
    const screen = screensRef.current.get(screenId)?.at(-1);
    const global = (screensRef.current.get("global") || []).flatMap(
      (registration) => registration.actions,
    );
    const available = new Map<string, AnyAction>();
    for (const action of screen?.actions || [])
      available.set(action.id, action);
    for (const action of global)
      if (!available.has(action.id)) available.set(action.id, action);
    const screenState = screen?.getScreenState() || { screenId };
    return {
      screenId,
      screenState,
      dictationTarget:
        typeof screenState.dictationTarget === "string"
          ? screenState.dictationTarget
          : null,
      actions: Array.from(available.values()).map(actionManifest),
    };
  }, []);

  return (
    <ActionContextValue.Provider value={{ register, run, routerContext }}>
      {children}
    </ActionContextValue.Provider>
  );
}

export function useActions() {
  const runtime = useContext(ActionContextValue);
  if (!runtime)
    throw new Error("useActions must be used inside ActionProvider");
  return runtime;
}

export function useRegisterActions(
  screenId: string,
  actions: AnyAction[],
  getScreenState: () => Record<string, unknown>,
) {
  const runtime = useActions();
  const stateRef = useRef(getScreenState);
  stateRef.current = getScreenState;
  useEffect(
    () => runtime.register(screenId, actions, () => stateRef.current()),
    [actions, runtime, screenId],
  );
  return runtime;
}
