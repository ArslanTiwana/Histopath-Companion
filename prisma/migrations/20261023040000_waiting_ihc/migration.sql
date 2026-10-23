ALTER TABLE "cases" ADD COLUMN "waiting_ihc" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "cases" ADD COLUMN "specimen_template_id" INTEGER;
ALTER TABLE "cases" ADD CONSTRAINT "cases_specimen_template_id_fkey" FOREIGN KEY ("specimen_template_id") REFERENCES "templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "templates" SET "specimen_type" = CASE lower("specimen_type")
  WHEN 'appendix' THEN 'appendix' WHEN 'gallbladder' THEN 'gallbladder'
  WHEN 'skin ellipse' THEN 'skin-ellipse' WHEN 'colon' THEN 'colon'
  WHEN 'breast' THEN 'breast' WHEN 'prostate' THEN 'prostate'
  ELSE lower(regexp_replace(trim("specimen_type"), '[^a-zA-Z0-9]+', '-', 'g')) END;

UPDATE "cases" SET "specimen_type" = CASE lower("specimen_type")
  WHEN 'appendix' THEN 'appendix' WHEN 'gallbladder' THEN 'gallbladder'
  WHEN 'skin ellipse' THEN 'skin-ellipse' WHEN 'colon' THEN 'colon'
  WHEN 'breast' THEN 'breast' WHEN 'prostate' THEN 'prostate'
  ELSE lower(regexp_replace(trim("specimen_type"), '[^a-zA-Z0-9]+', '-', 'g')) END
WHERE "specimen_type" IS NOT NULL;

UPDATE "cases" c SET "specimen_template_id" = t.id
FROM "templates" t WHERE t.kind = 'gross' AND t."specimen_type" = c."specimen_type";
