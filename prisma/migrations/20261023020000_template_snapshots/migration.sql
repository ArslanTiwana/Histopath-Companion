ALTER TABLE "templates" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "reports" ADD COLUMN "template_snapshot" JSONB;
ALTER TABLE "reports" ADD COLUMN "template_version" INTEGER;
