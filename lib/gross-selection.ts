export type PreviousGross = {
  fields: Record<string, string>;
  case: { caseLabel: string; specimenType: string | null };
};

export function previousGrossForSpecimen(
  entries: PreviousGross[],
  specimenType: string,
) {
  return (
    entries.find((entry) => entry.case.specimenType === specimenType) || null
  );
}
