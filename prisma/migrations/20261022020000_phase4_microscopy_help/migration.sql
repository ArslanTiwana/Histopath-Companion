CREATE TABLE "micro_entries" (
  "id" SERIAL PRIMARY KEY,
  "case_id" INTEGER NOT NULL UNIQUE,
  "dictation" TEXT NOT NULL,
  "differential" JSONB,
  "ihc" JSONB,
  "provisional_dx" TEXT,
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "micro_entries_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "help_sessions" (
  "id" SERIAL PRIMARY KEY,
  "case_id" INTEGER NOT NULL,
  "context_step" TEXT NOT NULL,
  "messages" JSONB NOT NULL,
  "added_note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "help_sessions_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "help_sessions_case_id_context_step_idx" ON "help_sessions"("case_id", "context_step");
