# HistoPath Companion: Full Product and Build Specification

A voice-first mobile web app (PWA) that helps a histopathology resident at AFIP with grossing, microscopy, consultant review, reporting and record keeping.

- **Owner / builder:** Arslan (full-stack developer)
- **First user:** his wife, a new histopathology resident
- **Wireframes (22 screens):** https://claude.ai/artifact/H4WUmX8QkXC1JnJaKn4zeu
- **Status:** planning finished, build starts next day, 6 phases

---

## 1. Purpose and Goals

**Problem.** A resident does her grossing rotation every 3 to 4 days, often 40 cases at once. Each case then needs microscopy, a consultant review, a report, a typist and a final check. As a new resident she also needs help remembering what to look for and what she diagnosed before.

**Goals**
1. Make every step fast and mostly hands-free (voice first).
2. Record every case and every step with timestamps, so nothing is lost.
3. Help her during grossing and microscopy with an on-demand voice chat.
4. Catch typist errors automatically (digits, laterality, stage).
5. Help her learn by comparing her diagnosis with the consultant's.

**Non-goals for v1**
- Login and registration (a 4-digit PIN is used instead).
- Quiz and flashcards (skipped for v1).
- Connection to the hospital information system.
- Image upload and image analysis.
- Multiple residents (design for it later, build for one now).

---

## 2. Golden Rules (apply to every phase)

1. **No patient details, ever.** Cases use only her own case label (e.g. S-108). No names, ages, MR numbers, phone numbers. Dictated text is for clinical findings only.
2. **A batch is only a label.** Every case is a full, independent case. Batch actions loop over single-case actions.
3. **Read back and confirm before saving** anything clinical or any stage change. Nothing is saved until she says "Save" (or taps it).
4. **Every action has a typed or tapped equivalent**, and every action is also reachable by voice.
5. **Nothing is silently lost.** Skipped or forced steps get an "Incomplete" tag, a reason and a timestamp.
6. **AI is a study aid.** She makes the diagnosis. The app says so on every suggestion screen.
7. **One AI module** with a configurable base URL, model name and API key, so Groq and OpenAI can be swapped by changing settings.
8. **One code path for case logic**, whether the case came from a batch or was added alone.

---

## 3. Tech Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js + React + TypeScript, installable as a PWA, mobile first |
| Backend | Next.js API routes (or NestJS if separated later) |
| Database | PostgreSQL (Neon or Supabase free tier for hosting) |
| ORM | Prisma or Drizzle |
| Speech to text | Groq Whisper (`whisper-large-v3` or `-turbo`), with a histopathology vocabulary in the `prompt` field |
| Text AI (commands, structuring, help chat) | Groq Llama with tool calling for v1; OpenAI as an upgrade path |
| Text to speech | Browser Speech Synthesis (free) |
| Report file | `.docx` generation (docx library) and plain text copy |
| Hosting | Vercel (app) + Neon/Supabase (database) |
| IDE | Google Antigravity IDE, with an `AGENTS.md` for context |

**Provider notes**
- Groq free tier needs no card. Published free limits (checked Oct 2026): Whisper about 2,000 requests and 28,800 audio seconds per day, 20 requests per minute. Text models roughly 30 requests per minute and between 1,000 and 14,400 requests per day depending on the model. Limits change, so check the Groq console. The free tier has no privacy guarantee.
- OpenAI has no free tier (prepaid credit). Prices seen: GPT-4o mini $0.15 / $0.60 per million tokens; GPT-4o $2.50 / $10; gpt-4o-mini-transcribe $1.25 per million audio tokens (about $0.003 per minute, as far as I know).
- **Estimated cost per case** (about 10 voice commands, 5 minutes of audio): about 2 cents with OpenAI mini, 7 to 8 cents with GPT-4o. About 300 cases a month gives roughly $5 to $6 (mini) or $25 (GPT-4o). Groq free is $0. A hybrid (Groq Whisper free + GPT-4o mini) is about $1.20 a month.

---

## 4. Security and Privacy

- **PIN gate:** 4 digits, stored hashed (bcrypt or argon2). Maximum 5 wrong attempts, then a lock of a few minutes. Session cookie (httpOnly, secure). PIN can be changed in Settings.
- The PIN is weak security, which is why the no-patient-details rule is strict. Keep authentication behind one function so it can be replaced by real login later.
- Do not log full transcripts on the server beyond what the case record needs.
- AI calls send only: specimen type, current step, checklist state, and her dictated clinical text. Never a patient identifier.
- Before sharing with colleagues, confirm with AFIP or her seniors that cloud AI tools are allowed in the workflow.
- Provide data export (JSON or CSV) so she is never locked in.

---

## 5. Data Model

All tables have `id`, `created_at`, `updated_at` unless noted.

| Table | Key fields |
|---|---|
| `settings` | `pin_hash`, `failed_attempts`, `locked_until`, `ai_provider`, `ai_base_url`, `model_text`, `model_stt` |
| `batches` | `name`, `range_start`, `range_end`, `count` |
| `cases` | `case_label` (unique, e.g. S-108), `batch_id` (nullable), `specimen_type`, `priority`, `status`, `incomplete` (bool), `locked` (bool), `delivered_at` |
| `case_steps` | `case_id`, `step` (gross, micro, consultant, report, typist, delivered), `status` (pending, done, skipped, forced), `reason`, `completed_at` |
| `gross_entries` | `case_id`, `fields` (jsonb: length, diameter, serosa, perforation, sections...), `transcript`, `description_text`, `notes` |
| `micro_entries` | `case_id`, `dictation`, `differential` (jsonb), `ihc` (jsonb), `provisional_dx`, `notes` |
| `consultant_entries` | `case_id`, `consultant_dx` (jsonb: histology, grade, pT, pN, margins...), `comparison` (jsonb), `learned_note` |
| `reports` | `case_id`, `template_id`, `content` (jsonb), `status` (draft, approved), `approved_at`, `version` |
| `typist_checks` | `case_id`, `typed_text`, `diff` (jsonb), `result` (match, differences), `override_reason`, `checked_at` |
| `help_sessions` | `case_id`, `context_step` (gross or micro), `messages` (jsonb), `added_note` |
| `templates` | `kind` (gross, report), `specimen_type`, `schema` (jsonb), `default_text` |
| `reminders` | `case_id`, `due_at`, `text`, `done` |
| `events` (audit log) | `case_id`, `type`, `payload` (jsonb), `at` |

**Case status values (in order)**
`gross_pending` → `gross_done` → `micro_pending` → `micro_done` → `with_consultant` → `consultant_dx_added` → `report_draft` → `report_approved` → `with_typist` → `needs_confirmation` → `delivered`

**Flags (not statuses):** `incomplete` (a step was skipped or forced), `revisit` (a reminder exists), `locked` (delivered).

**Rules**
- A skipped or forced step sets the step status, stores the reason and sets `incomplete = true`.
- A delivered case is locked. Unlocking needs a reason and is logged.
- Every status change, edit, skip, force and unlock writes an `events` row.

---

## 6. The Voice System

### 6.1 Core loop
1. She taps the mic (or uses push to talk).
2. Audio goes to Whisper with a histopathology vocabulary prompt.
3. The transcript plus the current screen context goes to the text model with the **tool list** below.
4. The model returns a tool call (or a clarifying question).
5. The app validates the arguments, shows the result, and speaks a short reply.
6. Anything that saves or changes a stage goes through **read back and confirm** first.

### 6.2 Tools (voice actions)

| Group | Tools |
|---|---|
| Navigation | `open_worklist`, `open_case(label)`, `next_case`, `go_back` |
| Intake | `create_batch(name, range)`, `create_case(label, specimen, priority)` |
| Gross | `set_specimen(type)`, `set_gross_field(field, value)`, `same_as_previous(changes)`, `read_back`, `save_gross` |
| Micro | `add_micro_text`, `set_provisional_dx`, `save_micro` |
| Help | `open_help`, `close_help`, `add_to_notes` |
| Skip / force | `skip_step(case, step, reason)`, `force_complete(case, reason)` |
| Consultant | `send_to_consultant(cases or range)`, `set_consultant_dx(case, fields)`, `add_learned_note` |
| Report | `generate_report`, `read_report`, `approve_report` |
| Typist | `send_to_typist(cases)`, `submit_typed_report(case)`, `send_back_to_typist(case)`, `confirm_delivery(case)` |
| Search / reminders | `search_cases(query)`, `show_pending`, `show_stuck(days)`, `show_incomplete`, `set_reminder(case, when, text)` |
| System | `confirm`, `cancel`, `undo_last`, `close_day` |

### 6.3 Confirmation rules
- **Always read back and confirm:** saving gross, saving micro, diagnoses, report approval, delivery, force complete, skip, bulk actions, unlock.
- **Bulk actions** show counts first ("17 ready, 3 not ready") and report failures per case afterwards.
- **Undo:** "undo" reverts the last confirmed action (kept for the current session).
- Low-confidence or ambiguous commands trigger a clarifying question, never a guess.

### 6.4 Error handling
- "Didn't catch that" (empty or very short transcript): show it and ask to repeat.
- Groq rate limit (HTTP 429): short automatic retry, then "busy, try again" with a typed fallback.
- No network: queue nothing silently, show offline state, allow typed notes saved locally (later).
- Invalid tool arguments: ask a follow-up question instead of failing.

---

## 7. Screens (22)

Numbers match the wireframe canvas. Screen 0 (PIN) is not drawn yet.

### 0. PIN gate
- **Purpose:** keep the app private.
- **Input:** 4-digit PIN (keypad).
- **Output:** session starts and goes to Screen 1 (first open of the day) or Screen 2.
- **Errors:** wrong PIN counter; lock after 5 attempts.

### 1. Morning briefing
- **Purpose:** start the day with what matters.
- **Shows:** spoken summary (cases to revisit, waiting for IHC, waiting for consultant final), list of revisit cases with status pills.
- **Input:** tap or voice ("open worklist").
- **Output:** opens the Worklist.
- **Data:** `reminders` due today, cases `with_consultant` for more than N days.

### 2. Worklist (home)
- **Purpose:** one board for all cases, batch or single.
- **Shows:** counts per stage (Gross, Micro, Consultant, Typist, Confirm); filters (batch, single, incomplete); "needs attention" list (overdue, incomplete, typed report returned); voice hint card.
- **Input:** voice or tap; filter chips; tap a case.
- **Output:** opens a case at its current step; bulk actions via voice.
- **Rules:** a batch is only a filter. "Overdue" = no progress for N days (default 2).

### 3. New batch
- **Purpose:** create many cases at once.
- **Input (voice):** "New batch, cases S-101 to S-140."
- **Shows:** batch name (default date-based), range, count, starting stage (Waiting for gross).
- **Output:** on confirm, creates 40 independent cases (`gross_pending`) and one `batches` row.
- **Validation:** duplicate labels are rejected and listed.

### 4. Add single case
- **Purpose:** add one case without a batch.
- **Input (voice):** "New case S-141, skin ellipse, urgent."
- **Shows:** case ID, specimen, priority, batch = None.
- **Output:** creates one case at `gross_pending`.

### 5. Next case (specimen picker)
- **Purpose:** start grossing the next ungrossed case.
- **Input:** specimen type by voice or tap (Appendix, Gallbladder, Skin ellipse, Colon, Breast, Prostate, Other).
- **Shows:** standard gross template loaded; checklist for that specimen.
- **Output:** opens Screen 6 for that case. "Same as previous" copies the last case's values for editing.

### 6. Gross (guided)
- **Purpose:** collect the gross description quickly.
- **Shows:** step progress (Step 2 of 6), checklist (e.g. Length, Diameter, Serosa, Perforation, Sections), what she said, a draft gross description that builds live, the **Ask for help** button.
- **Input (voice):** answers to one question at a time ("seven centimetres", "no perforation"). The app always asks the next missing item.
- **Output:** updates the draft; when complete, goes to Screen 9.
- **Buttons:** Ask for help (Screen 7), Skip step and Force complete (Screen 10), Save.

### 7. Gross help (voice chat)
- **Purpose:** on-demand help while grossing.
- **Input (voice):** what she sees and what she needs ("the tip looks thickened with a pale area near the base, what should I note?").
- **Context sent to AI:** specimen type, current step and checklist state, no patient details.
- **Output:** a short answer (what to describe, measure, submit); a "Listening..." state; a note "Study aid. Follow your department protocol."
- **Buttons:** Add to gross notes, Close help.
- **Close:** goes to Screen 8.

### 8. Back to gross (resumes)
- **Purpose:** return from help without losing progress.
- **Shows:** "Added from help" note (only if she chose to add it), the checklist exactly as before, the app resuming ("Welcome back. Any perforation?").
- **Output:** the guided questions continue as in Screen 6. The help transcript is stored in `help_sessions`; only the chosen text goes into the case notes.

### 9. Read-back and save (gross)
- **Purpose:** confirm the gross description before saving.
- **Shows:** the final draft; "Reading aloud".
- **Input (voice):** "Save", or edits ("change length to 8 cm").
- **Output:** on Save, writes `gross_entries`, marks the gross step done, status becomes `gross_done`, then `micro_pending`.

### 10. Skip or force complete
- **Purpose:** move on when a step is not needed or not possible.
- **Input:** choose Skip step or Force complete; **reason is required** (voice).
- **Shows:** what is missing; the tag that will be added (Incomplete); that it is logged.
- **Output:** step status `skipped` or `forced`, reason stored, `incomplete = true`, event logged. "Show incomplete cases" later lists these so she can fill them in.

### 11. Microscopy
- **Purpose:** record microscopy and a provisional diagnosis.
- **Input (voice):** dictation ("transmural neutrophilic infiltrate, mucosal ulceration, no dysplasia").
- **Shows:** dictated text; suggested differential; suggested IHC if tumour is suspected; her provisional diagnosis field; the line "Suggestions are study aids. You decide."; the **Ask for help** button.
- **Output:** saves `micro_entries`; status becomes `micro_done`.
- **Buttons:** Ask for help (Screen 12), Ignore suggestion, Send to consultant.

### 12. Micro help (voice chat)
- Same behaviour as Screen 7, but for microscopy.
- **Context sent to AI:** specimen type, her dictated findings so far, the current differential. No patient details.
- **Buttons:** Add to micro notes, Close help (goes to Screen 13).

### 13. Back to micro (resumes)
- Same as Screen 8 for microscopy. Shows "Added from help", the provisional diagnosis (e.g. "Not set yet"), and resumes with the next question ("Any dysplasia or mass at the tip?").

### 14. Bulk send to consultant
- **Purpose:** hand many cases to the consultant at once.
- **Input (voice):** "Send S-101 to S-120 to consultant."
- **Shows:** selected count, ready (micro done), not ready (micro missing, will be skipped).
- **Output:** each ready case becomes `with_consultant`; each case is updated on its own; failures are listed.

### 15. Consultant comparison
- **Purpose:** record the consultant's diagnosis and compare it with hers.
- **Input (voice):** "Consultant diagnosis for S-131: adenocarcinoma G2, pT3 N1, margins clear."
- **Shows:** a table (parameter, my diagnosis, consultant); differences highlighted; "Saved to Learned from"; a voice-note box; the **Generate report** button.
- **Output:** writes `consultant_entries` with a comparison; status `consultant_dx_added`; adds an entry to Learned from if there are differences.

### 16. Learned from
- **Purpose:** her private log of differences.
- **Shows:** cases with the difference type (Staging, Grading, Margins) and her note; a pattern summary ("2 of 3 differences involve staging").
- **Input:** voice search or tap.
- **Output:** opens a case.

### 17. Report preview
- **Purpose:** produce the final report from a template.
- **Shows:** template name (e.g. Colon resection); Specimen, Gross, Microscopy, Diagnosis, Stage, Margins, Laterality.
- **Built from:** the consultant's diagnosis plus her gross and micro text.
- **Input (voice):** "Read it back", "edit...", "approve".
- **Output:** on Approve, `reports.status = approved`, case status `report_approved`.

### 18. Send to typist
- **Purpose:** hand approved reports to the typist as one file.
- **Shows:** number of approved reports, the file name (e.g. Typist_21Oct.docx), share options (WhatsApp, email, print).
- **Input (voice):** "Send all approved to typist."
- **Output:** generates the file and the share action; cases become `with_typist`.

### 19. Typist verification
- **Purpose:** check the typed report against the approved one.
- **Input:** upload or paste the typed report text.
- **Shows:** a field-by-field table (laterality, diagnosis, measurements, stage, margins); matches ticked, differences highlighted; a hint like "digits look swapped"; "Delivery stays locked until every field matches."
- **Output:** all match enables Confirm and deliver; differences enable Send back to typist (lists exactly what to fix). Override needs a reason.

### 20. Delivered
- **Purpose:** final locked state and history.
- **Shows:** delivery time; timeline (Gross, Micro, Consultant, Report approved, Typist confirmed); "Locked. Changes need an unlock with a reason."
- **Output:** case `locked = true`, `delivered_at` set.

### 21. Voice search
- **Input (voice):** "Show my last three breast cases with DCIS."
- **Shows:** matching cases with status.
- **Output:** tap or say "open the second one."

### 22. End of day
- **Purpose:** close the day.
- **Shows:** counts (done, revisit, learned); reminders created; cases carried over.
- **Input (voice):** "Remind me Thursday", "close day."
- **Output:** saves the summary; tomorrow's briefing (Screen 1) uses it.

### Not drawn yet (build in the matching phase)
Settings (PIN change, AI provider, templates), template manager, voice listening overlay states, and error states (not caught, rate limited, offline).

---

## 8. End-to-End Flows

### A. Single case, normal path
1. Add case (Screen 4) → Next case (5) → Gross guided (6) with optional help (7, 8) → Read-back and Save (9).
2. Microscopy (11) with optional help (12, 13) → provisional diagnosis saved.
3. Send to consultant (14) → consultant comparison (15) → Learned from (16) if different.
4. Report preview and approve (17) → Send to typist (18) → Typist verification (19) → Delivered (20).

### B. Batch of 40 cases
1. New batch (3) creates 40 independent cases.
2. She grosses them one by one with "Next case" (5, 6, 9); defaults make common specimens quick.
3. The Worklist (2) shows all stages; she asks "what's pending?" at any point.
4. Bulk actions: send many to consultant (14), send many approved reports to the typist (18).
5. Everything else is per case, exactly like a single case.

### C. Skip or force complete
1. From any step: "S-112, skip micro" or "force complete".
2. App asks for a reason (voice), then confirms.
3. Case gets the Incomplete tag; "show incomplete cases" lists them to finish later.

### D. Voice help inside a step
1. On Gross or Micro, tap Ask for help.
2. She speaks; the assistant answers briefly.
3. She chooses Add to notes (or not), then Close help.
4. App returns to the same screen and continues the guided questions.

### E. Consultant and typist loop
1. Consultant diagnosis entered → comparison saved → report generated from the consultant's diagnosis.
2. Report approved → bundled file shared → typist returns text.
3. App compares typed vs approved. Match → deliver. Mismatch → send back with an exact list → repeat until match.

---

## 9. AI Calls (what each one gets and returns)

| Call | Input | Output |
|---|---|---|
| Transcription | audio + vocabulary prompt (histopathology terms) | transcript |
| Command router | transcript, current screen, case context, tool list | one tool call or a clarifying question |
| Gross structuring | specimen type, answers so far, template | JSON fields + draft description text |
| Micro structuring | dictation, specimen type | cleaned micro text |
| Differential and IHC suggestions | micro findings, specimen type | short differential list, IHC panel (JSON), always labelled as a study aid |
| Help chat | context (specimen, step, current state) + her speech | short practical answer; never a diagnosis |
| Report builder | consultant diagnosis, gross, micro, template | report JSON and text |
| Comparison | her diagnosis vs consultant's (structured) | difference list (mostly plain code, not AI) |
| Typist diff | approved report fields vs typed text | field-by-field result (parse with AI, compare with code) |

**Rules for all prompts:** return JSON only when a structure is needed, validate it, never invent measurements, mark unknowns as missing, never include or ask for patient identifiers.

**Typist diff logic**
- Critical fields: laterality, diagnosis, grade, measurements, stage (pT, pN), margins.
- Normalise (case, spacing, units), compare numbers exactly, flag digit transposition (e.g. 3.2 vs 2.3), flag left/right swaps.
- Any critical difference blocks Confirm and deliver unless she overrides with a reason.

---

## 10. Build Plan: 6 Phases

Each phase ends with something she can use and test. Estimated 1 to 1.5 weeks per phase part-time, 6 to 8 weeks total.

### Phase 1: Foundation (no AI)
- Next.js PWA, Postgres, schema, PIN gate (hashed, attempt limit, lock).
- Screens: PIN (0), Worklist (2), New batch (3), Add single case (4), case statuses, audit log.
- **Done when:** she can create a batch of 40 and single cases and see them by stage.

### Phase 2: Voice layer
- Mic recording, Groq Whisper with vocabulary prompt, tool-calling router, browser TTS, read back and confirm, undo.
- Voice versions of Phase 1 actions.
- **Done when:** "new batch S-101 to S-140", "next case", "show pending" work by voice.

### Phase 3: Grossing
- Specimen templates and checklists, guided flow, gross description, read back and save.
- Screens: 5, 6, 9, 10 (skip, force, Incomplete tag).
- **Done when:** she can gross a case start to finish by voice, and skip or force with a logged reason.

### Phase 4: Microscopy and voice help
- Help chat for gross (7, 8) and micro (12, 13); micro dictation, differential, IHC, provisional diagnosis (11); bulk send to consultant (14).
- **Done when:** help opens, answers, adds notes and returns to the same step with progress intact.

### Phase 5: Consultant, report and typist
- Screens 15 to 20: consultant entry and comparison, Learned from, report templates and approval, typist file, typist check, delivery and lock.
- **Done when:** a case goes from micro to Delivered with a caught typist error in a test.

### Phase 6: Polish and launch
- Morning briefing (1), voice search (21), end of day (22), reminders, settings, template manager, error states, export, deployment.
- Trial run with her on 10 dummy cases, then fix what she finds.
- **Done when:** she has used it for a full dummy batch without help from you.

### Test checklist (every phase)
- Works on her phone browser and as an installed PWA.
- Each voice action has a typed or tapped fallback.
- Nothing saves without confirmation.
- Batch and single cases behave identically.
- No patient details appear in any field, log or AI call.

---

## 11. Costs Summary

| Setup | Approx. monthly (about 300 cases) |
|---|---|
| Groq free for everything (v1) | $0 |
| Groq Whisper free + GPT-4o mini | about $1.20 |
| OpenAI transcribe + GPT-4o mini | about $5 to $6 |
| OpenAI for everything with GPT-4o | about $25 |
| Hybrid (OpenAI transcribe, mini for commands, GPT-4o for reports and suggestions) | about $10 |

Set a monthly spend limit in the OpenAI dashboard if paid models are used. Prices change, so re-check before choosing.

---

## 12. Future (after v1)

- Real login and multiple residents, with private Learned from per resident and shared templates.
- Quiz and flashcards from her own cases.
- Local models with Ollama and local Whisper if hospital policy requires it.
- Image upload for teaching files.
- Revisit reminders as push notifications.

---

## 13. Open Questions to Settle While Building

1. Which specimen templates first (suggested: appendix, gallbladder, skin ellipse, colon, breast, prostate)?
2. Her department's exact grossing protocols and report formats (to build accurate templates).
3. AFIP policy on cloud AI tools.
4. What "overdue" should mean (default 2 days without progress).
5. How the typist returns reports (Word, photo, text) so the check can be built for the real format.
6. Her laptop or phone hardware, if local models are ever needed.