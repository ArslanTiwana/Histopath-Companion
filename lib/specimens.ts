export const STARTER_SPECIMENS = [
  { slug: "appendix", name: "Appendix" },
  { slug: "gallbladder", name: "Gallbladder" },
  { slug: "skin-ellipse", name: "Skin ellipse" },
  { slug: "colon", name: "Colon" },
  { slug: "breast", name: "Breast" },
  { slug: "prostate", name: "Prostate" },
] as const;

export function specimenSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function specimenName(slug: string | null | undefined) {
  if (!slug) return "Specimen not set";
  return (
    STARTER_SPECIMENS.find((item) => item.slug === slug)?.name ||
    slug.replaceAll("-", " ").replace(/^./, (letter) => letter.toUpperCase())
  );
}
