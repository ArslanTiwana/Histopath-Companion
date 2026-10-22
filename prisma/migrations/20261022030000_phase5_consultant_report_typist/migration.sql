CREATE TABLE "consultant_entries" (
  "id" SERIAL PRIMARY KEY,
  "case_id" INTEGER NOT NULL UNIQUE,
  "consultant_dx" JSONB NOT NULL,
  "comparison" JSONB NOT NULL,
  "learned_note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "consultant_entries_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "reports" (
  "id" SERIAL PRIMARY KEY,
  "case_id" INTEGER NOT NULL UNIQUE,
  "template_id" INTEGER,
  "content" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "approved_at" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "reports_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "reports_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "templates"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "typist_checks" (
  "id" SERIAL PRIMARY KEY,
  "case_id" INTEGER NOT NULL,
  "typed_text" TEXT NOT NULL,
  "diff" JSONB NOT NULL,
  "result" TEXT NOT NULL,
  "override_reason" TEXT,
  "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "typist_checks_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "typist_checks_case_id_checked_at_idx" ON "typist_checks"("case_id", "checked_at");
