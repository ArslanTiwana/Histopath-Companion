import { z } from "zod";

export const HISTOPATHOLOGY_VOCABULARY = [
  "histopathology",
  "grossing",
  "microscopy",
  "specimen",
  "biopsy",
  "resection",
  "appendix",
  "gallbladder",
  "colon",
  "breast",
  "prostate",
  "skin ellipse",
  "serosa",
  "perforation",
  "mucosa",
  "dysplasia",
  "neoplasia",
  "carcinoma",
  "adenocarcinoma",
  "lymphoma",
  "sarcoma",
  "infiltrate",
  "mitosis",
  "necrosis",
  "margin",
  "staging",
  "grade",
  "pT",
  "pN",
  "IHC",
  "immunohistochemistry",
  "consultant",
  "typist",
  "S-101",
  "S-140",
].join(", ");

const envSchema = z.object({
  LLM_PROVIDER: z.string().trim().min(1).default("groq"),
  GROQ_API_KEY: z.string().trim().min(1, "GROQ_API_KEY is required"),
  AI_BASE_URL: z.url("AI_BASE_URL must be a valid URL"),
  AI_MODEL_STT: z.string().trim().min(1, "AI_MODEL_STT is required"),
  AI_MODEL_COMMANDS: z.string().trim().min(1, "AI_MODEL_COMMANDS is required"),
  AI_MODEL_COMMANDS_FALLBACK: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().trim().min(1).optional(),
  ),
  AI_MODEL_CHAT: z.string().trim().min(1, "AI_MODEL_CHAT is required"),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");
  throw new Error(`Invalid AI environment configuration: ${details}`);
}

export const aiConfig = {
  provider: parsed.data.LLM_PROVIDER,
  apiKey: parsed.data.GROQ_API_KEY,
  baseUrl: parsed.data.AI_BASE_URL.replace(/\/$/, ""),
  modelStt: parsed.data.AI_MODEL_STT,
  modelCommands: parsed.data.AI_MODEL_COMMANDS,
  modelCommandsFallback: parsed.data.AI_MODEL_COMMANDS_FALLBACK,
  modelChat: parsed.data.AI_MODEL_CHAT,
};
