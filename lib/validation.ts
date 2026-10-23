import { z } from "zod";

export const idParamSchema = z.coerce.number().int().positive();

export function parseIdParam(value: string): number | null {
  const parsed = idParamSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
