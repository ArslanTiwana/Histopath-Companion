export function containsPatientIdentifier(text: string): boolean {
  return /\b(?:mrn?|medical record|patient name|name is|aged?\s+\d|\+?\d[\d\s-]{8,})\b/i.test(
    text,
  );
}
