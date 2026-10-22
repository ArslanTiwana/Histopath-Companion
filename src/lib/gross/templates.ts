export type GrossField = {
  key: string;
  label: string;
  question: string;
  placeholder: string;
};
export type GrossTemplate = { name: string; fields: GrossField[] };

const common = (extras: GrossField[]): GrossField[] => [
  {
    key: "received",
    label: "Received",
    question: "How was it received?",
    placeholder: "In formalin, intact",
  },
  ...extras,
  {
    key: "sections",
    label: "Sections",
    question: "Which sections were submitted?",
    placeholder: "Entirely submitted in A1–A3",
  },
];

export const GROSS_TEMPLATES: Record<string, GrossTemplate> = {
  Appendix: {
    name: "Appendix",
    fields: common([
      {
        key: "length",
        label: "Length",
        question: "What is the length?",
        placeholder: "7 cm",
      },
      {
        key: "diameter",
        label: "Diameter",
        question: "What is the maximum diameter?",
        placeholder: "0.8 cm",
      },
      {
        key: "serosa",
        label: "Serosa",
        question: "Describe the serosa.",
        placeholder: "Smooth and congested",
      },
      {
        key: "perforation",
        label: "Perforation",
        question: "Is there a perforation?",
        placeholder: "No perforation identified",
      },
    ]),
  },
  Gallbladder: {
    name: "Gallbladder",
    fields: common([
      {
        key: "dimensions",
        label: "Dimensions",
        question: "What are the dimensions?",
        placeholder: "8 × 3 × 2 cm",
      },
      {
        key: "serosa",
        label: "Serosa",
        question: "Describe the serosa.",
        placeholder: "Smooth green-tan",
      },
      {
        key: "wall",
        label: "Wall",
        question: "What is the wall thickness?",
        placeholder: "0.3 cm",
      },
      {
        key: "contents",
        label: "Contents",
        question: "Describe the contents and stones.",
        placeholder: "Green bile; no stones",
      },
    ]),
  },
  "Skin ellipse": {
    name: "Skin ellipse",
    fields: common([
      {
        key: "dimensions",
        label: "Dimensions",
        question: "What are the dimensions?",
        placeholder: "2 × 1 × 0.5 cm",
      },
      {
        key: "lesion",
        label: "Lesion",
        question: "Describe the lesion.",
        placeholder: "0.6 cm tan papule",
      },
      {
        key: "margins",
        label: "Margins",
        question: "Describe the margins.",
        placeholder: "Ink peripheral and deep margins",
      },
    ]),
  },
  Colon: {
    name: "Colon",
    fields: common([
      {
        key: "length",
        label: "Length",
        question: "What is the bowel length?",
        placeholder: "20 cm",
      },
      {
        key: "lesion",
        label: "Lesion",
        question: "Describe and measure the lesion.",
        placeholder: "3 cm ulcerated mass",
      },
      {
        key: "margins",
        label: "Margins",
        question: "Give the margin distances.",
        placeholder: "5 cm from nearest margin",
      },
      {
        key: "nodes",
        label: "Nodes",
        question: "How many nodes were found?",
        placeholder: "12 candidate nodes",
      },
    ]),
  },
  Breast: {
    name: "Breast",
    fields: common([
      {
        key: "dimensions",
        label: "Dimensions",
        question: "What are the specimen dimensions?",
        placeholder: "10 × 8 × 4 cm",
      },
      {
        key: "orientation",
        label: "Orientation",
        question: "How is it oriented?",
        placeholder: "Short superior, long lateral",
      },
      {
        key: "lesion",
        label: "Lesion",
        question: "Describe and measure the lesion.",
        placeholder: "2 cm firm white lesion",
      },
      {
        key: "margins",
        label: "Margins",
        question: "Give lesion-to-margin distances.",
        placeholder: "1 cm from deep margin",
      },
    ]),
  },
  Prostate: {
    name: "Prostate",
    fields: common([
      {
        key: "weight",
        label: "Weight",
        question: "What is the weight?",
        placeholder: "45 g",
      },
      {
        key: "dimensions",
        label: "Dimensions",
        question: "What are the dimensions?",
        placeholder: "5 × 4 × 3 cm",
      },
      {
        key: "surface",
        label: "Surface",
        question: "Describe the external surface.",
        placeholder: "Ink right and left surfaces",
      },
      {
        key: "submission_method",
        label: "Submission method",
        question: "How was it submitted?",
        placeholder: "Entirely submitted sequentially",
      },
    ]),
  },
  Other: {
    name: "Other",
    fields: common([
      {
        key: "dimensions",
        label: "Dimensions",
        question: "What are the dimensions?",
        placeholder: "Enter measurements",
      },
      {
        key: "appearance",
        label: "Appearance",
        question: "Describe the external and cut surfaces.",
        placeholder: "Describe appearance",
      },
    ]),
  },
};

export const SPECIMEN_TYPES = Object.keys(GROSS_TEMPLATES);
export function buildGrossDescription(
  specimen: string,
  fields: Record<string, string>,
): string {
  const template = GROSS_TEMPLATES[specimen] || GROSS_TEMPLATES.Other;
  const details = template.fields
    .filter((field) => fields[field.key]?.trim())
    .map((field) => `${field.label}: ${fields[field.key].trim()}`);
  return `${specimen} specimen. ${details.join(". ")}${details.length ? "." : ""}`;
}
