ALTER TABLE "settings"
  DROP COLUMN IF EXISTS "ai_provider",
  DROP COLUMN IF EXISTS "ai_base_url",
  DROP COLUMN IF EXISTS "model_text",
  DROP COLUMN IF EXISTS "model_stt";
