# HistoPath Companion

Voice-first PWA for a histopathology resident (grossing, microscopy,
consultant review, report, typist check). Full spec: docs/histopath-companion-spec.md
Read the spec before starting any task.

## Golden rules

1. NEVER store or send patient details. Cases use only a case label (e.g. S-108).
2. A batch is only a label. Every case is independent. One code path for case logic.
3. Read back and confirm before saving anything clinical or changing a stage.
4. Every action works by voice AND by tap/typing.
5. Skipped/forced steps need a reason, set incomplete=true, and write an events row.
6. AI is a study aid. Never output a final diagnosis as fact.
7. All AI calls go through ONE module (src/lib/ai) with configurable
   base URL, model, API key. Default provider: Groq.

## Stack

Next.js (App Router) + TypeScript, Tailwind, Postgres, Prisma, PWA.
Mobile-first (390px wide). Indigo #3D3A8C primary, pink #D6457A accent.
AI is configured with `LLM_PROVIDER` (Groq by default), `GROQ_API_KEY`,
`AI_BASE_URL`, `AI_MODEL_STT`, `AI_MODEL_COMMANDS`, optional
`AI_MODEL_COMMANDS_FALLBACK`, and `AI_MODEL_CHAT`. All provider calls go through
`src/lib/ai`.

## Conventions

- Code in src/, API routes in src/app/api, DB in prisma/schema.prisma
- Validate all inputs with zod. No `any`.
- Every status change writes an events row.
- Small commits. Run lint + typecheck before finishing a task.
- Do not add features outside the current phase.

## Current phase

Phase 6: Briefing, search, end-of-day, reminders, settings, templates, export, PWA, and launch readiness.

## UI source of truth

Use `docs/HistoPath Companion — App Wireframes.html` as the visual source of truth for every screen. Match its 390 × 844 mobile layouts, colors, spacing, cards, controls, voice bar, and bottom navigation when updating current screens or building future phases.
