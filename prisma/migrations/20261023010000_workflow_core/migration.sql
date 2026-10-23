ALTER TABLE "reports"
  ADD COLUMN "read_back_at" TIMESTAMP(3),
  ADD COLUMN "read_back_version" INTEGER;

ALTER TABLE "typist_checks"
  ADD COLUMN "corrections" JSONB,
  ADD COLUMN "returned_at" TIMESTAMP(3);

UPDATE "cases" SET "status" = 'micro_pending' WHERE "status" = 'gross_done';

ALTER TYPE "CaseStatus" RENAME TO "CaseStatus_old";
CREATE TYPE "CaseStatus" AS ENUM (
  'gross_pending',
  'micro_pending',
  'micro_done',
  'with_consultant',
  'consultant_dx_added',
  'report_draft',
  'report_approved',
  'with_typist',
  'needs_confirmation',
  'delivered'
);
ALTER TABLE "cases" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "cases"
  ALTER COLUMN "status" TYPE "CaseStatus"
  USING ("status"::text::"CaseStatus");
ALTER TABLE "cases" ALTER COLUMN "status" SET DEFAULT 'gross_pending';
DROP TYPE "CaseStatus_old";
