export type RouterAction = {
  id: string;
  description: string;
  risk: "safe" | "confirm";
  args: Record<string, unknown>;
};

export type RouterContext = {
  screenId: string;
  screenState: Record<string, unknown>;
  actions: RouterAction[];
  lastTurns: ConversationTurn[];
  dictationTarget?: string | null;
};

export type ConversationTurn = {
  user?: string;
  assistant?: string;
  actions?: Array<{ id: string; args: Record<string, unknown> }>;
};

export type RouterActionCall = {
  id: string;
  args: Record<string, unknown>;
};
