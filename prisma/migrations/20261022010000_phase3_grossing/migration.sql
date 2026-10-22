CREATE TABLE "gross_entries" (
  "id" SERIAL PRIMARY KEY,
  "case_id" INTEGER NOT NULL UNIQUE,
  "fields" JSONB NOT NULL,
  "transcript" TEXT,
  "description_text" TEXT NOT NULL,
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "gross_entries_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "templates" (
  "id" SERIAL PRIMARY KEY,
  "kind" TEXT NOT NULL,
  "specimen_type" TEXT NOT NULL,
  "schema" JSONB NOT NULL,
  "default_text" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE UNIQUE INDEX "templates_kind_specimen_type_key" ON "templates"("kind", "specimen_type");
