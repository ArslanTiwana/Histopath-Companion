import { z } from "zod";
import type { ReportContent } from "./phase5-actions";

export const reportFieldKeys = [
  "specimen",
  "gross",
  "microscopy",
  "diagnosis",
  "grade",
  "stage",
  "margins",
  "laterality",
  "tumourSize",
] as const;

const reportFieldSchema = z.union([
  z.enum(reportFieldKeys),
  z.object({
    key: z.string().trim().min(1).max(80),
    defaultText: z.string().max(8000).optional(),
  }),
]);

export const managedReportTemplateSchema = z.object({
  fields: z.array(reportFieldSchema).min(1),
});

export type ManagedReportTemplate = {
  id: number;
  schema: unknown;
  defaultText: string | null;
};

function interpolate(text: string, values: Record<string, string>) {
  return text.replace(/\{\{?([A-Za-z][A-Za-z0-9]*)\}?\}/g, (token, key) =>
    key in values ? values[key] : token,
  );
}

export function applyReportTemplate(
  source: ReportContent,
  template: ManagedReportTemplate | null,
) {
  if (!template) return source;
  const parsed = managedReportTemplateSchema.safeParse(template.schema);
  if (!parsed.success) return source;
  const values = source as unknown as Record<string, string>;
  const content: Record<string, string> = {};
  for (const field of parsed.data.fields) {
    const key = typeof field === "string" ? field : field.key;
    const fallback = typeof field === "string" ? undefined : field.defaultText;
    content[key] =
      values[key] ||
      (fallback ? interpolate(fallback, values) : "Not recorded");
  }
  if (template.defaultText?.trim())
    content.additionalText = interpolate(template.defaultText.trim(), values);
  return content;
}
