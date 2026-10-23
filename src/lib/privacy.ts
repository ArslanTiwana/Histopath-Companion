export function containsPatientIdentifier(text: string): boolean {
  return /\b(?:mrn?|medical record|patient name|name is|aged?\s+\d|\+?\d[\d\s-]{8,})\b/i.test(
    text,
  );
}

export const PATIENT_IDENTIFIER_MESSAGE =
  "Remove patient-identifying details and use only the case label and clinical findings.";

export function containsPatientIdentifierInValue(value: unknown): boolean {
  if (typeof value === "string") return containsPatientIdentifier(value);
  if (Array.isArray(value))
    return value.some((item) => containsPatientIdentifierInValue(item));
  if (value && typeof value === "object")
    return Object.values(value).some((item) =>
      containsPatientIdentifierInValue(item),
    );
  return false;
}

export function assertNoPatientIdentifiers(value: unknown): void {
  if (containsPatientIdentifierInValue(value))
    throw new Error(PATIENT_IDENTIFIER_MESSAGE);
}
