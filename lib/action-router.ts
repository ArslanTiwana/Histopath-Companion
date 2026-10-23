import type { RouterAction } from "@/src/lib/ai/types";

export const ACTION_ROUTER_SYSTEM_PROMPT =
  "Route commands to the supplied app actions. Return at most 3 function calls in order. Use only supplied actions and arguments. Never invent clinical values or patient details. Ask briefly if required data is missing.";

export function buildActionRouterTools(actions: RouterAction[]) {
  const compactSchema = (
    schema: Record<string, unknown>,
  ): Record<string, unknown> => {
    const allowed = [
      "type",
      "properties",
      "required",
      "enum",
      "items",
      "minimum",
      "maximum",
    ];
    return Object.fromEntries(
      Object.entries(schema)
        .filter(([key]) => allowed.includes(key))
        .map(([key, value]) => [
          key,
          value && typeof value === "object" && !Array.isArray(value)
            ? compactSchema(value as Record<string, unknown>)
            : value,
        ]),
    );
  };
  return actions.slice(0, 24).map((action) => ({
    type: "function",
    function: {
      name: action.id,
      description: `${action.description.slice(0, 60)} [${action.risk}]`,
      parameters: compactSchema(action.args),
    },
  }));
}

export function estimateRouterStaticTokens(actions: RouterAction[]) {
  return Math.ceil(
    (ACTION_ROUTER_SYSTEM_PROMPT.length +
      JSON.stringify(buildActionRouterTools(actions)).length) /
      4,
  );
}
