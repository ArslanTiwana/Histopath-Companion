export const DEFAULT_VOICE_VOCABULARY = [
  "histopathology",
  "grossing",
  "microscopy",
  "specimen",
  "biopsy",
  "resection",
  "adenocarcinoma",
  "lymphoma",
  "margin",
  "staging",
  "pT",
  "pN",
];

const KEY = "histopath_voice_vocabulary";
export function readVoiceVocabulary(): string[] {
  if (typeof localStorage === "undefined") return DEFAULT_VOICE_VOCABULARY;
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || "[]") as unknown;
    return Array.from(
      new Set([
        ...DEFAULT_VOICE_VOCABULARY,
        ...(Array.isArray(value)
          ? value.filter((item): item is string => typeof item === "string")
          : []),
      ]),
    );
  } catch {
    return DEFAULT_VOICE_VOCABULARY;
  }
}
export function addVoiceVocabularyWord(word: string) {
  const words = Array.from(
    new Set([...readVoiceVocabulary(), word.trim()]),
  ).filter(Boolean);
  localStorage.setItem(KEY, JSON.stringify(words));
  return words;
}
