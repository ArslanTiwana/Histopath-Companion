import { z } from "zod";

export type ActionRisk = "safe" | "confirm";
export type ActionScreen = "global" | string;

export type ActionContext = {
  source: "tap" | "voice";
  confirmed?: boolean;
};

export type Action<TSchema extends z.ZodType = z.ZodType> = {
  id: string;
  description: string;
  args: TSchema;
  screens: ActionScreen[];
  risk: ActionRisk;
  describe: (args: z.output<TSchema>) => string;
  run: (
    args: z.output<TSchema>,
    ctx: ActionContext,
  ) => unknown | Promise<unknown>;
};

export type AnyAction = Omit<Action<z.ZodType>, "describe" | "run"> & {
  describe: (args: never) => string;
  run: (args: never, ctx: ActionContext) => unknown | Promise<unknown>;
};

export type ActionManifest = {
  id: string;
  description: string;
  risk: ActionRisk;
  args: Record<string, unknown>;
};

export function defineAction<TSchema extends z.ZodType>(
  action: Action<TSchema>,
): Action<TSchema> {
  return action;
}

export function actionManifest(action: AnyAction): ActionManifest {
  return {
    id: action.id,
    description: action.description,
    risk: action.risk,
    args: z.toJSONSchema(action.args) as Record<string, unknown>,
  };
}

export class ActionRegistry {
  private readonly actions = new Map<string, AnyAction[]>();

  register(actions: AnyAction[]) {
    for (const action of actions) {
      const stack = this.actions.get(action.id) || [];
      this.actions.set(action.id, [...stack, action]);
    }
    return () => {
      for (const action of actions) {
        const stack = (this.actions.get(action.id) || []).filter(
          (value) => value !== action,
        );
        if (stack.length) this.actions.set(action.id, stack);
        else this.actions.delete(action.id);
      }
    };
  }

  get(id: string) {
    return this.actions.get(id)?.at(-1);
  }

  list() {
    return Array.from(this.actions.values()).flatMap((stack) =>
      stack.length ? [stack[stack.length - 1]] : [],
    );
  }

  async run(id: string, rawArgs: unknown, ctx: ActionContext) {
    const action = this.get(id);
    if (!action)
      throw new Error(`Action ${id} is not available on this screen.`);
    const parsed = action.args.safeParse(rawArgs);
    if (!parsed.success)
      throw new Error(
        parsed.error.issues[0]?.message || `Invalid arguments for ${id}.`,
      );
    return action.run(parsed.data as never, ctx);
  }
}
