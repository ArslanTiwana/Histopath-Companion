# Voice and interaction audit

Audit date: 2026-10-23

Scope: the complete checked-in Next.js application, including every App Router page, shared interactive component, API route, domain action, voice parser/router, and the relevant Prisma model. This is an implementation audit, not a description of the intended wireframes.

## Classification used below

- **A — shared with voice:** the tap/type path and a voice path converge on the same named client handler, API, or server domain function. If only the final server function is shared, that is called out as “A (domain only)”.
- **B — component-only or duplicated:** the interaction is implemented only in the component, or the voice version separately duplicates/hard-codes the behavior instead of calling the same function.
- **B — no voice equivalent:** there is no working voice path for the interaction.

This is deliberately strict. Two controls that happen to navigate to the same URL are **B** if they hard-code that URL in separate places. That distinction identifies logic that will drift.

## Route and screen inventory

| Actual route/surface | Spec screen | Purpose in the implementation |
|---|---:|---|
| `/` before authentication | 0 | PIN setup/unlock gate. This gate exists only inside the home page. |
| `/briefing` | 1 | Fetch and speak the morning summary, show due reminders and overdue consultant cases, then enter the worklist. |
| `/` after authentication | 2, 3, 4, 14 | Worklist, filters, case/batch intake modals, and bulk consultant-send modal. |
| `/cases/[id]` | — | Case hub showing stage progress, saved gross/micro content, audit events, and the next-stage link. |
| `/cases/[id]/gross` specimen picker | 5 | Choose a gross template or copy the prior gross entry. |
| `/cases/[id]/gross` guide | 6, 8 | Guided gross fields/checklist; resumed grossing after closing help is the same component state, not a separate screen. |
| Gross `HelpPanel` overlay | 7 | Gross study-aid chat, optional add-to-notes, and close. |
| `/cases/[id]/gross` review mode | 9 | Gross read-back and confirmed save. |
| Gross bypass modal | 10 (partial) | Skip or force gross only. There is no general skip/force screen for other stages. |
| `/cases/[id]/micro` | 11, 13 | Microscopy dictation, suggestions, provisional diagnosis, review/save; resumed microscopy is the same component state. |
| Micro `HelpPanel` overlay | 12 | Microscopy study-aid chat, optional add-to-notes, and close. |
| Worklist consultant modal | 14 | Select cases and bulk-send ready cases to consultant. |
| `/cases/[id]/consultant` | 15 | Enter consultant fields, compare against the provisional diagnosis, save, and generate a report. |
| `/learned` | 16 | List consultant entries that have a non-null learned note and summarize the most common differing field. |
| `/cases/[id]/report` | 17 | Generate, edit, read, and approve a report. |
| `/typist` | 18 | Select approved reports, create a DOCX bundle, and download/share/print it. |
| `/cases/[id]/typist` | 19 | Paste or dictate typed report text, compare critical fields, return it, override, or deliver. |
| `/cases/[id]/delivered` | 20 | Display the locked delivered state and completed-step timeline. |
| `/search` | 21 | Text/voice case search and opening a result by ordinal. |
| `/end-day` | 22 | Daily counts, reminders, carry-over list, and confirmed close-day action. |
| `/settings` | not numbered | Overdue threshold, PIN change, displayed AI configuration, export, and links. |
| `/settings/templates` | not numbered | Create/update gross and report template records using raw JSON. |
| Global `OfflineBanner` | error state | Shows offline status and stores one local scratch note. |

There are 15 actual page routes. Several spec screens are modes or overlays rather than routes. There is no unlock screen, no general skip/force screen, and no reminder-management screen.

## Shared interactions present on many screens

### Bottom navigation (`AppNav`)

Present on every page after loading except the PIN surface. Each link is component-only navigation:

- **Worklist** → `Link href="/"`. **B.** The worklist voice command separately hard-codes `/` in the server command router.
- **Cases** → `Link href="/"`. **B.** It is functionally identical to Worklist; there is no distinct cases destination.
- **Learn** → `Link href="/learned"`. **B — no voice equivalent** outside local learned-page voice handling.
- **Settings** → `Link href="/settings"`. **B — no voice equivalent.**

### Global offline banner (`OfflineBanner` in root layout)

- **Temporary offline note textarea** → `setNote(...)` plus `localStorage.setItem("histopath_offline_note", ...)` on every change. **B — no voice equivalent.**

The service-worker registration has no interactive control.

### Reusable `DictationButton`

- **Mic/stop button** → local `start()`, `MediaRecorder.stop()`, `/api/voice/transcribe`, then the page-provided `onTranscript`. **A only for transcription mechanics.** The action interpretation remains separate in each page callback.

## Screen-by-screen interaction inventory

### `/` — PIN gate

Purpose: initial four-digit PIN creation or session unlock.

- **PIN input** → component `setPin`, strips non-digits. **B — no voice equivalent.**
- **Create PIN / Unlock form button** → component `submit()` → `POST /api/auth` → `setPin()` for setup or `verifyPin()` for unlock. **B — no voice equivalent.**

Notable behavior: successful setup calls `setPin()` but does not create the session cookie; see findings.

### `/briefing` — morning briefing

Purpose: speak and display reminders and cases waiting too long for consultant review.

- **Reminder/consultant case rows** → `Link` to `/cases/[id]`. **B.** Opening a case by voice elsewhere uses a separate router implementation.
- **Open worklist button** → `openWorklist()`; records `histopath_briefing_seen` and navigates to `/`. **A.** The page’s dictation callback calls the same function.
- **“Say open worklist” mic** → shared `DictationButton`; regex `/worklist|open/i` → `openWorklist()`. **A.**
- **Bottom navigation** → shared interactions listed above. **B.**

The summary automatically invokes browser speech synthesis on load; it is not an interactive control and has no replay button.

### `/` — authenticated worklist

Purpose: show stage counts, attention items, filters, case links, intake, and bulk handoff.

- **+ Case** → `setShowNew("single")`. **B.** Voice case creation uses the server voice session and never opens or shares this modal state.
- **Search cases link** → `/search`. **B.** No worklist command tool opens search.
- **End of day link** → `/end-day`. **B.** No worklist `close_day` or end-day navigation tool exists.
- **All filter** → `setFilter("all")`. **B — no voice equivalent.**
- **Batch filter** → `setFilter("batch")`. **B — no voice equivalent.**
- **Single filter** → `setFilter("single")`. **B — no voice equivalent.**
- **Incomplete filter** → `setFilter("incomplete")`. **A (state only).** Voice `show_incomplete` dispatches `voice-filter`, whose listener calls the same state setter.
- **+ New batch** → `setShowNew("batch")`. **B.** Voice batch creation has separate draft/pending state.
- **Start next gross** → direct `Link` to the first in-memory `gross_pending` case. **B.** Voice `next_case` independently queries the database and returns a URL.
- **Send cases to consultant** → `openConsultant()`; preselects every loaded case and opens the modal. **B.** Voice uses a server-side pending action rather than this handler/state.
- **Send approved reports to typist** → `/typist`. **B.** The voice send workflow exists only after entering `/typist` and uses separate logic.
- **Needs-attention case rows** → `/cases/[id]`. **B.** Voice `open_case` separately queries by label.
- **All-case rows** → `/cases/[id]`. **B.** Same duplication.
- **Voice hint card** is display-only.

Single-case modal:

- **Close (×)** → `setShowNew(null)`. **B — no voice equivalent.**
- **Case ID input** → browser `FormData` only. **B.** Voice intake has a separate parser/schema.
- **Specimen input** → browser `FormData` only. **B.** Voice intake has a separate parser and six hard-coded specimen names.
- **Priority select** → browser `FormData` only. **B.** Voice intake separately detects the word “urgent”.
- **Add case submit** → component `create()` → `POST /api/cases` → shared `createSingleCase()`. **A (domain only).** Voice confirmation calls `createSingleCase()` directly through `confirmPending()`.

Batch modal:

- **Close (×)** → `setShowNew(null)`. **B — no voice equivalent.**
- **Batch name input** → browser `FormData`. **B.** Voice defaults the name to `Voice batch`; spoken names are not reliably extracted.
- **From input** and **To input** → browser `FormData`. **B.** Voice range parsing is separate.
- **Create cases submit** → component `create()` → `POST /api/cases` → shared `createBatch()`. **A (domain only).** Voice confirmation calls `createBatch()` through `confirmPending()`.

Consultant bulk modal:

- **Close (×)** → `setConsultantOpen(false)`. **B — no voice equivalent.**
- **One checkbox per case** → mutates `selectedConsultant`. **B — no voice equivalent.**
- **Confirm bulk send** → `sendConsultant()` → `POST /api/consultant/send` → `sendCasesToConsultant()`. **A (domain only).** Voice confirmation reaches the same domain function through `confirmPending()`.

Worklist voice bar:

- **Typed command input** → `setTyped`. **A.** Submit and mic transcription both call `command()`.
- **Send button/form submit** → `command()` → `POST /api/voice/command`. **A.**
- **Mic/start/stop** → `start()`/`stop()` → `/api/voice/transcribe` → `command()`. **A.**
- Supported working command outcomes: open worklist, open case, next case, create batch, create case, show pending, show incomplete, go back, send a range to consultant, confirm, cancel, and undo the last newly created case(s).
- Advertised/routable but non-working: `show_stuck` returns only a generic reply; it never filters or returns cases.

### `/cases/[id]` — case hub

Purpose: show the case’s current state and route to its next screen.

- **← Worklist** → `/`. **B — no voice UI exists on this page.**
- **Stage-dependent primary link** → gross, micro, consultant, report, typist bundle, per-case typist check, or delivered route. **B — no voice UI exists on this page.**
- **Bottom navigation** → shared navigation. **B.**

The steps, gross/micro content, and events are display-only. There are no edit, skip/force, reminder, or unlock controls.

### `/cases/[id]/gross` — specimen picker

Purpose: select the gross checklist before collecting fields.

- **← Case** → case hub. **B.** Voice `go_back` exists only in the worklist bar, which is absent here.
- **Say specimen type / Stop** → local `startVoice()`/`stopVoice()` → transcription → `handleVoice()`. **A** for the picker’s local voice handler, but it recognizes only built-in `SPECIMEN_TYPES`, not managed templates.
- **One button per specimen type** → `setSpecimen(type)`. **B.** Voice performs a separate substring match.
- **Same as previous** → `copyPrevious()`, copying specimen and all fields from the latest older case. **B — no voice implementation**, despite the spec defining `same_as_previous`.
- **Bottom navigation** → **B.**

### `/cases/[id]/gross` — guided gross and gross review

Purpose: capture every template field, build a description, read it back, then save or bypass.

- **← case label** → case hub. **B.**
- **Ask for help** → `setHelpOpen(true)`. **B — no voice command opens help.**
- **Current-field input** → direct `setFields`. **B.** Voice calls separate `answer()` logic.
- **Answer by voice / Stop** → `startVoice()`/`stopVoice()` → `handleVoice()` → `answer()`. **A for voice recording; B relative to the typed input because field mutation is duplicated.**
- **Next** → `setIndex(index + 1)`; final click enters review. **B — no voice equivalent.**
- **Each checklist row** → `setIndex(fieldIndex)`. **B — no voice equivalent.**
- **Read back and save** → only `setMode("review")`. **B/mismatch.** Voice “read back” also speaks the description, while this tap does not.
- **Read aloud** → browser speech synthesis over `description`. **A.** Voice “read back” uses the same description but duplicates the speech call.
- **Edit answers** → `setMode("guide")`. **B — no voice edit command.**
- **Confirm and save** → `submitSave()` → `POST /api/cases/[id]/gross` → `completeGross()`. **A.** In review mode voice “save/confirm” calls the same `submitSave()`.
- **Skip gross** → `setBypass("skip")`. **A only when the entire voice phrase starts with “skip gross …reason”;** there is no shared open-modal handler.
- **Force complete** → `setBypass("force")`. **A only when the entire voice phrase starts with “force gross …reason”.**

Gross bypass modal:

- **Close (×)** → `setBypass(null)`. **B.** It does not clear the existing reason.
- **Reason textarea** → `setReason`. **B.** After opening the modal by tap, speaking a reason alone does not populate this field.
- **Say confirm or cancel / Stop** → local recorder → `handleVoice()`. **A** for confirm/cancel only. The label is misleading while recording because `busy` also covers transcription/network work.
- **Confirm skip/force** → `submitBypass()` → `POST /api/cases/[id]/gross` → `bypassGross()`. **A.** Voice “confirm/yes” calls the same function once `bypass` is set.

### Gross or micro help overlay (`HelpPanel`)

Purpose: contextual AI study aid with optional persistence to notes.

- **Close (×)** → `close()`; if messages exist, saves the help session, then closes. **A.** The other close buttons call the same function.
- **Question textarea** → `setText`. **B.** Voice transcription passes text directly to `ask()` rather than sharing the input state.
- **Ask form/button** → `ask(text)` → `POST /api/cases/[id]/help`; clears typed text first. **A.** Voice transcription calls the same `ask()`.
- **Ask by voice / Stop** → local recorder → transcribe → `ask(transcript)`. **A.**
- **Add answer to notes and close** → `close(latestReply)` → save help session, invoke parent `onAddNote`, close overlay. **B — no voice command.**
- **Close without adding** → `close()`. **B — no voice command.**

Important bug: the close control remains available while `ask()` is in flight. Closing then can save only the user-side snapshot, unmount the panel before the assistant response is shown, and lose/orphan the response.

### `/cases/[id]/micro` — microscopy

Purpose: record findings, request study suggestions, add a provisional diagnosis, review, save, and optionally send immediately.

- **← case label** → case hub. **B.**
- **Ask for help** → `setHelpOpen(true)`. **B — no voice open-help command.**
- **Microscopy findings textarea** → direct `setDictation`. **B.** Dictation uses separate append logic.
- **Add dictation / Stop** → local recorder → transcribe → append to `dictation`; in review mode “save/confirm” calls `save()`. **A for review save; B for text entry because mutation is duplicated.**
- **Generate study suggestions** → `suggest()` → `/api/cases/[id]/micro/suggest` → the shared AI module. **B — no voice action.**
- **Ignore suggestions** → clears `differential` and `ihc`. **B — no voice action.**
- **Provisional diagnosis input** → `setProvisionalDx`. **B — voice dictation always appends to findings, so a provisional diagnosis cannot be set by voice.**
- **Read back and save** → `setReview(true)`. **B — no voice command enters review.**
- **Read aloud** → browser speech synthesis. **B.** No local voice command triggers it.
- **Edit** → `setReview(false)`. **B — no voice command.**
- **Confirm and save** → `save(false)` → `/api/cases/[id]/micro` → `completeMicro()`. **A.** Review-mode voice “save/confirm” calls the same function.
- **Confirm, save and send to consultant** → `save(true)` → saves micro, then separately calls `/api/consultant/send`. **B — no voice equivalent for this combined operation.**
- **Say confirm and save / Stop** → local recorder; only exact save/confirm phrases in review invoke `save(false)`. **A.**
- **Help overlay controls** → as described above.
- **Bottom navigation** → **B.**

There is no skip or force control for microscopy.

### `/cases/[id]/consultant` — consultant comparison

Purpose: capture a structured consultant diagnosis, compare it, persist learning, and generate a report.

- **← Case** → case hub. **B.**
- **Diagnosis input** → direct `setFields`. **B.**
- **Grade input** → direct `setFields`. **B.**
- **pT input** → direct `setFields`. **B.**
- **pN input** → direct `setFields`. **B.**
- **Margins input** → direct `setFields`. **B.**
- **Laterality input** → direct `setFields`. **B.**
- **Tumour size input** → direct `setFields`. **B.**
- **Learned note textarea** → `setLearnedNote`. **B — no voice path.**
- **Dictate consultant diagnosis** → shared recorder → local `applyDictation()`. **B relative to typed fields.** It fills diagnosis with the entire transcript and regex-extracts grade, pT, pN, laterality, and tumour size; it does not extract margins or learned note.
- **Read back and compare** → only `setReview(true)`; it does not speak anything and does not call the server comparison. **B — no voice path.**
- **Edit** → `setReview(false)`. **B — no voice path.**
- **Confirm and save** → `save()` → `/api/cases/[id]/consultant` → `saveConsultantEntry()`. **B — no voice save/confirm path on this screen.**
- **Generate report** → `generate()` → `/api/cases/[id]/report` → `generateReport()`. **A.** The screen’s dictation callback calls the same `generate()`.
- **Say generate report mic** → `generate()` on matching transcript. **A.**
- **Bottom navigation** → **B.**

There is no status guard in the page. The server rejects an invalid consultant save, but an already-saved case can still show a mutable-looking form or report controls depending on loaded data.

### `/learned` — learned-from log

Purpose: show saved learned notes and a simple most-common-difference summary.

- **Each learned row** → `Link` to its case. **B.**
- **Say open S-… mic** → local regex, lookup in the currently loaded entries, then `window.location.href`. **B.** It duplicates link navigation and can open only cases already in this filtered list.
- **Bottom navigation** → **B.**

There is no typed search despite the spec saying voice search or tap, and no way to edit a learned note here.

### `/cases/[id]/report` — report generation/preview

Purpose: create a report from the current case data, edit fields, read it aloud, and approve it.

No-report state:

- **← Case** → case hub. **B.**
- **Confirm and generate report** → `generate()` → `/api/cases/[id]/report` → `generateReport()`. **B — no mic is rendered in this state**, even though the consultant page has a voice generate control.

Preview state:

- **← Case** → case hub. **B.**
- **One textarea per report content key while editing** → `setContent`. **B — voice “edit” only enables editing; it cannot edit a field.**
- **Read it back** → `readBack()`. **A.** Voice action calls the same function.
- **Edit / Preview toggle** → toggles `editing`. **A.** Voice “edit” sets `editing=true`; voice cannot return to preview.
- **Approve** → `approve()` → `/api/cases/[id]/report` → `approveReport()`. **A.** Voice “approve” calls the same function.
- **Say read, edit, or approve mic** → local `voiceAction()`. **A for those three actions.**
- **Bottom navigation** → **B.**

Neither tap nor voice records/enforces that read-back happened before approval.

### `/typist` — send approved reports

Purpose: bundle selected approved reports, move them to `with_typist`, and share the DOCX.

- **← Worklist** → `/`. **B.**
- **One checkbox per approved case** → mutates `selected`. **B — no per-case voice selection.**
- **Review send** → `setReview(true)`. **A.** Voice “send … typist” sets the same state.
- **Cancel** → `setReview(false)`. **B — the mic callback has no cancel command.**
- **Confirm and prepare** → `send()` → `/api/typist/send` → `sendApprovedReports()`. **A.** Voice “confirm” during review calls the same function.
- **Download** → `download()` creates an object URL and clicks a generated anchor. **B — no voice equivalent.**
- **Email** → `share()` using generic Web Share, falling back to download. **B — no voice equivalent.**
- **WhatsApp** → the exact same `share()` as Email. **B — no channel-specific behavior or voice equivalent.**
- **Print** → `window.print()`. **B — no voice equivalent.**
- **Say send all approved to typist mic** → opens review or confirms through `send()`. **A.**
- **Bottom navigation** → **B.**

### `/cases/[id]/typist` — typist verification

Purpose: parse critical fields from pasted/dictated text, compare them, return differences, override, or deliver.

- **← Case** → case hub. **B.**
- **Typed-report textarea** → `setTypedText`. **B.** Dictation separately appends text.
- **Dictate typed report mic** → shared recorder, page callback appends to `typedText`. **B relative to the textarea because mutation is duplicated.**
- **Read back before comparing** → only `setReview(true)`; it does not use speech synthesis. **B — no voice equivalent.**
- **Edit** → `setReview(false)`. **B — no voice equivalent.**
- **Confirm and compare** → `action({action:"check", ...})` → `/api/cases/[id]/typist` → `checkTypedReport()`. **B — no voice command runs comparison.**
- **Send back to typist** → `sendBack()` → the common `action()` API wrapper, then clears local diff/text/review. **A (API only).** Voice sends the same API action but bypasses `sendBack()` and therefore behaves differently.
- **Override details/summary** → browser disclosure state. **B — no voice equivalent.**
- **Override reason textarea** → `setOverrideReason`. **B — no voice equivalent.**
- **Confirm override and deliver** → `deliver(reason)` → common `action()` → `deliverCase()`. **B — voice cannot supply an override reason.**
- **Confirm & deliver** → `deliver()` → common `action()` → `deliverCase()`. **A.** Voice confirm/deliver calls the same `deliver()` even when differences exist (the server then rejects it).
- **Say send back or confirm delivery mic** → local `voice()`. **A at the API/domain level, but the send-back client behavior differs from tap.**
- **Bottom navigation** → **B.**

There is no file upload control despite the spec allowing upload or paste.

### `/cases/[id]/delivered` — delivered record

Purpose: display delivery timestamp, completed steps, and locked state.

- **Back to worklist** → `/`. **B — no voice UI.**
- **Bottom navigation** → **B.**

There is no unlock control or API even though the page says changes can be unlocked with a reason.

### `/search` — search

Purpose: search case labels, specimen/status, resident diagnosis, and consultant JSON.

- **← Worklist** → `/`. **B.**
- **Search input** → `setQuery`. **A.** Form submit and voice both ultimately call `search(value)`.
- **Search submit** → `search()` → `GET /api/search`. **A.**
- **Each result row** → `Link` to the case. **B.** Voice ordinal opening independently assigns `window.location.href`.
- **Search or open a result mic** → `voice()`: opens the first–fifth result by ordinal, otherwise calls `search(text)`. **A for search, B for opening.**
- **Bottom navigation** → **B.**

### `/end-day` — end of day

Purpose: show daily totals, create reminders, and save a day summary.

- **← Worklist** → `/`. **B.**
- **Reminder text input** → `setText`. **B.** Voice never captures actual reminder content; it hard-codes `Follow up`.
- **Reminder date input** → `setWhen`. **B.** Voice has a separate broad regex.
- **Review and save reminder** → despite its label, calls `addReminder()` immediately → `/api/reminders`. **B — no voice save/confirm path.**
- **Close day** → `setReview(true)`. **A.** Voice “close day” calls the same state setter.
- **Cancel close** → `setReview(false)`. **B — no voice cancel.**
- **Confirm close day** → `closeDay()` → `/api/end-day` → shared `closeDay()` domain action. **B — voice cannot confirm it.**
- **Say remind me Thursday or close day mic** → local `voice()`. **B for reminders** because it only fills `when` and a fake reminder text; **A for opening close-day review.**
- **Bottom navigation** → **B.**

Reminder rows and carry-over rows are display-only; reminders cannot be marked done even though the API supports it.

### `/settings` — settings

Purpose: change overdue threshold/PIN, inspect environment-provided AI models, export data, and navigate to templates/end-of-day.

- **Overdue-days number input** → local `setData`. **B — no voice equivalent.**
- **Confirm settings** → generic local `save()` → `/api/settings`. **B — no voice equivalent.**
- **Current PIN input** → `setCurrentPin`, numeric filtering. **B — appropriately no voice equivalent.**
- **New PIN input** → `setNewPin`, numeric filtering. **B — appropriately no voice equivalent.**
- **Confirm PIN change** → generic `save()` → `/api/settings` → `verifyPin()` then `setPin()`. **B — appropriately no voice equivalent.**
- **Manage templates** → `/settings/templates`. **B — no voice equivalent.**
- **Export all case data** → browser download from `/api/export`. **B — no voice equivalent.**
- **End-of-day summary** → `/end-day`. **B — no voice equivalent.**
- **Bottom navigation** → **B.**

The AI configuration is read-only; settings stored in the database for provider/base URL/models are not used by `src/lib/ai`, which reads environment variables.

### `/settings/templates` — template manager

Purpose: create/update gross or report template records.

- **← Settings** → `/settings`. **B — no voice equivalent.**
- **Each existing template button** → `edit(item)` loads it into local form state. **B — no voice equivalent.**
- **Kind select** → local `setForm`. **B — no voice equivalent.**
- **Specimen type input** → local `setForm`. **B — no voice equivalent.**
- **Schema JSON textarea** → local `setForm`. **B — no voice equivalent.**
- **Default text textarea** → local `setForm`. **B — no voice equivalent.**
- **Review template** → `setReview(true)`. **B — no voice equivalent.**
- **Edit** in confirmation panel → `setReview(false)`. **B — no voice equivalent.**
- **Confirm and save** → local `save()` → `/api/templates`. **B — no voice equivalent.**
- **Bottom navigation** → **B.**

Report templates and `defaultText` are stored but not consumed by report generation.

## Bugs, dead controls, and duplicated logic

### Authentication and privacy

1. **First-time PIN setup does not authenticate the user.** `/api/auth` calls `setPin()` and returns success, but only `verifyPin()` writes the session cookie. The UI immediately navigates to `/briefing`, whose API returns 401. This can leave the first run on malformed briefing data.
2. **The PIN gate protects only the home-page UI.** Direct navigation to every other page is possible. APIs return 401, but pages generally parse the error as successful screen data rather than redirecting to the gate; this yields crashes, invalid rendering, or indefinite loading instead of a consistent auth boundary.
3. **The PIN setup copy is inaccurate.** It says the PIN “stays on this device,” but the bcrypt hash is stored in the server database. The hash is preferable to a raw PIN, but this is still not device-local storage.
4. **Patient-identifier checks are incomplete.** Gross save, microscopy save, report edits, template text, case specimen text, voice command transcripts, and the offline scratch note can store or send identifying text without `containsPatientIdentifier()`. Search puts raw query text in the URL. Audio is sent to transcription before any transcript can be screened.
5. **The identifier regex is only a narrow heuristic.** It misses many plausible identifiers and can also false-positive on long clinical numbers. It is not a sufficient enforcement boundary for the “never store or send patient details” rule.
6. **Voice pending/undo state is process-global.** `pending`, `draft`, and `lastCreatedIds` are module variables, not tied to a cookie/session. Concurrent users or requests can confirm, cancel, or undo one another’s work; serverless restarts also erase the state.

### Confirmation, audit, and workflow integrity

6. **Tap intake bypasses read-back confirmation.** The single-case and batch forms submit directly. Voice intake has a pending confirmation, so tap and voice do not obey the same safety rule.
7. **“Review and save reminder” does not review.** It persists immediately with `confirmed:true`. Voice can populate only a date and the generic text `Follow up`, and cannot save/confirm the reminder.
8. **Report approval does not require an actual read-back.** Tap or voice can approve immediately; no state proves that the current report content was read and confirmed.
9. **`confirmed:true` is client-asserted rather than a server-side confirmation protocol.** Any caller can send it in one request. This affects every clinical save/stage transition.
10. **The generic `/api/cases/[id]/status` endpoint is a dangerous dead API.** It accepts a cast `CaseStatus` without Zod or a confirmation flag and can advance one status at a time without completing the corresponding step. No UI uses it.
11. **Not every mutation is audited consistently.** Case creation always records `source:"voice"` even for tap/API creation. Report field edits are folded into approval without an edit event. Send-back records an event but no workflow state. Template/settings global events have no case, which is reasonable, but confirmation is inconsistent.
12. **Gross status events describe states the row never held.** `completeGross()` directly updates the case from `gross_pending` to `micro_pending`, then writes two events via a virtual `gross_done` intermediary. The history is descriptive rather than a record of persisted transitions and does not use `changeCaseStatus()`.
13. **Skip/force exists only for gross.** Micro, consultant, report, and typist stages have no shared skip/force flow, reason capture, incomplete flagging, or voice tools.
14. **Delivered records cannot be unlocked.** The UI promises reasoned/logged unlock, but there is no control, API, or domain action.

### Voice behavior and dead/partial voice paths

15. **The global voice bar exists only on the worklist.** It is not in the root layout and therefore cannot execute navigation/system commands from case, gross, micro, consultant, report, typist, learned, search, end-day, or settings pages.
16. **The central command router implements only 12 of the spec’s tools.** It lacks gross/micro/help/skip/force/report/typist/search/reminder/close-day actions. Screen-local regex callbacks fragment the remaining voice behavior.
17. **`show_stuck` is dead.** It is exposed to the AI tool router but `execute()` has no implementation beyond a generic reply. No `stuck` filter exists in the worklist.
18. **The worklist advertises commands the displayed voice layer cannot fully honor.** “Show stuck cases” is dead. Range send works, but typed/tapped selection and voice range selection use separate state and confirmation UIs.
19. **No spoken provisional diagnosis path exists.** On microscopy, all non-save voice text appends to findings; the provisional diagnosis field is typing-only.
20. **No voice path exists for Same as previous, open help, add help answer to notes, generate suggestions, ignore suggestions, consultant save, report field edits, typist compare, override reason, reminder save, settings, templates, export, or unlock.** These violate the “every action works by voice and tap/typing” rule.
21. **Gross managed specimen templates are tap-only.** The picker displays managed template names, but `handleVoice()` matches only the built-in `SPECIMEN_TYPES` list.
22. **Voice-created “Skin ellipse” becomes `Skin Ellipse`.** The fast parser title-cases every word. Template lookup is case-sensitive, so the later gross screen falls back to the `Other` checklist unless the user reselects the built-in spelling.
23. **Gross bypass voice is awkward/incomplete.** A full phrase such as “skip gross because …” captures a reason. If the user taps Skip first, the modal mic can understand confirm/cancel but speaking the reason alone is treated as a gross field answer rather than populating the reason.
24. **“Read back and save” controls often do not read back.** Gross’s main button only enters review; consultant’s “Read back and compare” only changes local mode; typist’s “Read back before comparing” only displays a `<pre>`. Only explicit “Read aloud” controls invoke speech synthesis.
25. **Voice handling is duplicated in four recorder implementations.** `VoiceBar`, `DictationButton`, Gross, Micro, and `HelpPanel` each manage `MediaRecorder`, chunks, transcription errors, and state independently (five implementations total).
26. **Command interpretation is duplicated across the central parser/router and page regex handlers.** Confirmation words, navigation, report actions, typist actions, gross bypass, reminder parsing, and result selection have different grammars and error behavior.
27. **Recorder state is inconsistent and can trigger invalid/overlapping work.** Gross uses one `busy` flag for recording, transcription, saving, and network work, so a second click can call `stop()` on an inactive recorder. `HelpPanel` shows “Stop” during a typed AI request, but clicking it can start a second recording/request. `VoiceBar` also forces `audio/webm`, which is not supported by every mobile browser targeted by the PWA.

### Case workflow bugs

28. **Micro save-and-send is not atomic.** `save(true)` first commits microscopy/status, then makes a second request to send the case. If the second request fails, the UI reports failure while the case is already `micro_done`; retrying the combined action then fails because microscopy is no longer pending.
28. **Typist send-back does not reset workflow data/state.** The API only writes `returned_to_typist`. The latest differing check remains current and status stays `with_typist`. Tap temporarily clears local state after an extra reload, but refreshing restores the old diff. Voice send-back does not even clear local state.
29. **Typist voice send-back and tap send-back differ.** Tap calls `sendBack()` and clears local text/review/diff; voice calls `action()` directly, so the old comparison stays visible.
30. **Typist comparison requires exact `Field: value` lines.** Dictated prose or a normal report format frequently parses fields as missing. There is no AI parse step even though the spec calls for AI parsing plus code comparison.
31. **No typist file upload exists.** Only paste and voice dictation are available.
32. **Consultant voice parsing is lossy.** It stores the entire dictated sentence as `diagnosis`, separately extracts a few fields, never extracts margins, and cannot dictate the learned note. Comparison against the resident’s full provisional diagnosis therefore produces unreliable field-level matches.
33. **The Learned-from banner and list disagree.** Consultant review says differences are “Saved to Learned from after confirmation,” but `/api/learned` returns only entries whose `learnedNote` is non-null. Differences with no note disappear from the Learned screen.
34. **The Learned page’s voice open works only on listed entries.** It cannot open an arbitrary case and silently does nothing when not found.
35. **Report templates are dead data.** The template manager stores `kind="report"`, schema, and default text, but `generateReport()` always uses one hard-coded `ReportContent` shape and does not assign `templateId`.
36. **Gross template `defaultText` is also unused.** Managed gross schema fields are used, but default text is never loaded.
37. **“Email” and “WhatsApp” are the same generic Web Share call.** Neither selects its named channel; unsupported devices silently download instead.
38. **Case hub cannot represent all defined statuses cleanly.** `gross_done` and `micro_done` have no primary case-level action (micro save moves directly to `micro_done`, after which only the worklist bulk action advances it). This may be intended for `micro_done`, but the hub presents no send action.
39. **The worklist’s Needs attention logic is incomplete.** It includes only urgent or `incomplete` cases. It does not calculate overdue cases, reminders, or typed reports returned with differences, despite the screen spec and configurable `overdueDays` setting.
40. **The “Batch · N cases” eyebrow is misleading.** It shows the name of the first case that has any batch plus the total count of all cases, including other batches and single cases.
41. **Bulk consultant modal preselects every case.** This creates a potentially huge list of irrelevant not-ready cases instead of defaulting to ready cases or a requested batch/range.
42. **Same as previous ignores workflow/batch/specimen context.** It selects the newest gross entry from any older-created case, which may be a different specimen or batch. The UI allows copying it without an explicit source-case review.
43. **Reminder completion is dead UI functionality.** `POST /api/reminders` supports `{id, done}`, but no control calls it.
44. **`waitingIhc` is inferred from reminder text containing “IHC”.** It is not derived from microscopy/IHC workflow state, so briefing counts depend on wording.
45. **End-of-day close has no behavioral consequence for the next briefing.** It stores a `DaySummary`, but briefing never reads it. The client writes `histopath_day_closed`, but nothing reads that key.
46. **Morning briefing seen-state uses UTC date.** `new Date().toISOString().slice(0,10)` can disagree with the user’s local day around midnight; displayed dates use local time. Typist filenames similarly mix UTC/client and server dates.
47. **Fetch failures and 401s are usually not checked on page load.** Many pages cast any JSON error body to their success type. This can cause runtime exceptions, misleading empty states, or stuck loading instead of a useful error/auth redirect.

### Validation and architecture duplication

48. **Several inputs are not validated with Zod.** `/api/auth`, `/api/cases`, and `/api/cases/[id]/status` use TypeScript casts/manual checks. This conflicts with the repository convention.
49. **Case logic is split across direct Prisma calls and domain modules.** Gross updates status manually; later phases use `changeCaseStatus()`; voice calls domain functions directly; tap usually calls APIs; send-back writes Prisma directly in its route. This is the central source of behavior drift.
50. **The source layout conflicts with the stated convention.** Most code is in top-level `app/` and `lib/`, while the project instructions say code should live in `src/` and API routes in `src/app/api`.
51. **The database AI settings are disconnected from runtime AI configuration.** Prisma has `aiProvider`, `aiBaseUrl`, `modelText`, and `modelStt`, but the settings screen displays environment-derived config and cannot update those columns.
52. **The `requireAuth()` helper is unused.** Every API repeats an authentication check, while page routing has no centralized guard.

## Batch versus single-case behavior

The core persisted `Case` rows, steps, and later clinical routes are shared once created. That is the strongest part of the “batch is only a label” rule. Differences remain at intake and selection boundaries:

1. **Creation source metadata is wrong for both:** both `createSingleCase()` and each batch child log `source:"voice"`, including tap-created records.
2. **Tap intake validation differs:** single-case accepts an optional arbitrary specimen and priority; batch cases have no specimen or priority fields at creation.
3. **A single case created with a specimen skips the specimen-picker branch when grossing; batch cases always start with no specimen and therefore enter the picker.** They share the gross route but not the same initial interaction path.
4. **Voice intake validation differs:** voice single-case recognizes only six specimens and title-cases them; voice batch cannot reliably preserve a spoken batch name. Tap uses the user-entered name.
5. **Tap and voice confirmations differ:** tap creates immediately; voice stages a process-global pending action and requires a later confirm.
6. **Worklist label/filter behavior differs:** the Batch and Single chips are tap-only. Voice has no batch/single filter tool.
7. **“Start next gross” ignores the active filter/batch:** both tap and voice choose the oldest/first global `gross_pending` case, not the next case in the visible batch.
8. **“Same as previous” crosses batch and single boundaries:** it searches all earlier cases and can copy from either source.
9. **Bulk consultant voice selection is label-range based; tap selection is database-ID checkbox based.** They share the final `sendCasesToConsultant()` function but not selection or confirmation state.
10. **Bulk typist selection is available only by entering `/typist`; voice there means all currently selected approved cases.** There is no voice range/case selection equivalent to the checkboxes.
11. **After intake, gross, micro, consultant, report, typist check, and delivery do use the same per-case routes and domain rows.** No later code explicitly branches on `batchId`, which is correct.

## Where mic and voice UI currently lives

| Location | Component/implementation | Capability |
|---|---|---|
| Worklist only | `VoiceBar` | Typed or recorded central commands; visible transcript/reply; TTS response. |
| Morning briefing | `DictationButton` | Recognizes open/worklist only. |
| Gross specimen, guide, review, bypass | Bespoke recorder in gross page | Specimen selection, field answer, gross read-back/save, gross skip/force phrase, confirm/cancel. |
| Gross help overlay | Bespoke recorder in `HelpPanel` | Transcribe a help question and call the same help `ask()`. |
| Micro entry/review | Bespoke recorder in micro page | Append findings; confirm/save in review. |
| Micro help overlay | Same `HelpPanel` recorder | Transcribe a help question. |
| Consultant entry | `DictationButton` | Populate selected consultant fields with local regex parsing. |
| Consultant saved state | `DictationButton` | Generate report only. |
| Learned from | `DictationButton` | Open a listed case by spoken S-number. |
| Report preview | `DictationButton` | Read, enter edit mode, or approve. No mic before a report exists. |
| Typist bundle | `DictationButton` | Enter review and confirm bundle preparation. |
| Typist verification entry | `DictationButton` | Append dictated typed-report text. |
| Typist verification result | `DictationButton` | Send back or attempt delivery. |
| Search | `DictationButton` | Search text or open result positions one through five. |
| End of day | `DictationButton` | Populate a crude reminder date or open close-day review. |

No mic/voice UI exists on the PIN gate, case hub, delivered page, settings, template manager, global bottom navigation, offline note, export, or unlock (which does not exist).

## Refactor plan — smallest safe steps first

1. **Add characterization tests before moving logic.** Cover every current tap action and voice phrase, status/event effects, auth setup, batch/single parity, typist return loop, and privacy rejection. Tests should explicitly assert confirmation state rather than just `confirmed:true` payloads.
2. **Fix the immediate safety defects without restructuring UI:** authenticate after first PIN setup; reject/redirect unauthorized pages consistently; remove or lock down the unused status endpoint; scope pending voice actions to the authenticated session; add privacy validation to every clinical storage/AI boundary.
3. **Create one recorder/transcription hook/component.** Replace the five MediaRecorder implementations with a single `useVoiceInput` state machine for permission, recording, stop, transcription, rate limit, empty audio, cleanup, and offline behavior.
4. **Create a typed action registry.** Define all actions (`openCase`, `createCase`, `saveGross`, `saveMicro`, `sendToConsultant`, `approveReport`, etc.) once with Zod input, confirmation requirement, read-back text, allowed status, and execution function. Both API routes and voice dispatch should call it.
5. **Move confirmation into a session-scoped server model.** Store a short-lived pending-action token containing action name, validated arguments, user/session ID, read-back, and expiry. Confirm/cancel consumes that token. Do not trust a naked client boolean.
6. **Put a single contextual voice shell in the root authenticated layout.** Give it route/case context and the action registry. Keep page-specific hints, but eliminate page-specific command grammars. PIN and sensitive PIN entry can remain excluded.
7. **Extract shared page action handlers.** Each interactive action should have one handler called by both tap and voice: set specimen, answer gross field, select checklist item, open/close help, set provisional diagnosis, enter review, save, send back, override, and so on.
8. **Unify all status changes.** Make one transition service update the case, step, incomplete/locked flags, and events transactionally. Remove direct status writes and the generic public status route.
9. **Make combined operations transactional/idempotent.** Especially micro-save-and-send, typist send-back/resubmission, report generation, and delivery. A retry should return the current successful state instead of failing after a partial commit.
10. **Implement one general bypass action.** Accept case, step, mode (`skip`/`force`), reason, and confirmation; enforce allowed stages, set the step/incomplete flag, transition safely, and log it. Expose the same action by tap and voice.
11. **Repair typist verification as a loop.** Send-back should mark the check returned, preserve the requested corrections, present a fresh input state, accept corrected text, and compare again. Add upload if required by the real workflow.
12. **Make intake share one draft model.** The modal and voice should edit the same typed intake draft, show the same read-back, and invoke the same confirmed action. Normalize specimen keys through template IDs/slugs rather than display strings.
13. **Connect templates to their consumers.** Validate gross/report schemas, use report templates and default text in generation, record `templateId/version`, and preserve a template snapshot for auditability.
14. **Build the missing Phase 6 actions on the registry.** Stuck/overdue filter, reminder create/complete, voice search navigation, close day, export, settings where appropriate, and unlock-with-reason.
15. **Then align presentation with the wireframes.** Once behavior is unified, make all 390×844 surfaces use the same voice bar, listening/error states, confirmation sheet, and bottom navigation without duplicating workflow logic.

## Ten highest-risk problems

1. **Patient details can be stored or sent through multiple unchecked fields and voice/AI paths**, violating the project’s primary safety rule.
2. **First-time PIN setup does not establish a session**, breaking the onboarding path immediately after the PIN is created.
3. **Confirmation is only a client-supplied boolean**, so clinical saves and stage changes are not truly protected by read-back/confirm semantics.
4. **Voice pending and undo state is global to the server process**, creating cross-session action/undo risk and unreliable behavior after restarts.
5. **Most actions are not available through both voice and tap**, and the only central voice bar exists on the worklist.
6. **The unused generic status endpoint can advance cases without step completion, Zod validation, or confirmation**, corrupting workflow history.
7. **Micro save-and-send is non-atomic**, so a network/API failure can leave the UI and persisted case at different stages.
8. **The typist correction loop is broken**, because send-back does not reset persisted comparison state or establish a clean resubmission workflow.
9. **Skip/force and unlock are missing outside the narrow gross implementation**, so incomplete and delivered cases cannot follow the specified audited recovery paths.
10. **Status, event, and action logic is fragmented across components, API routes, and several domain modules**, making batch/tap/voice behavior drift and allowing misleading audit events such as every intake being labeled `source:"voice"`.
