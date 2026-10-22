ALTER TABLE "settings" ADD COLUMN "overdue_days" INTEGER NOT NULL DEFAULT 2;

CREATE TABLE "reminders" (
  "id" SERIAL PRIMARY KEY,
  "case_id" INTEGER,
  "due_at" TIMESTAMP(3) NOT NULL,
  "text" TEXT NOT NULL,
  "done" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "reminders_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "reminders_due_at_done_idx" ON "reminders"("due_at", "done");

CREATE TABLE "day_summaries" (
  "id" SERIAL PRIMARY KEY,
  "day" DATE NOT NULL UNIQUE,
  "counts" JSONB NOT NULL,
  "closed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);
