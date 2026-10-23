CREATE TABLE "pending_actions" (
  "token" TEXT PRIMARY KEY,
  "session_id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "args" JSONB NOT NULL,
  "read_back_text" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "pending_actions_session_id_created_at_idx"
  ON "pending_actions"("session_id", "created_at");
CREATE INDEX "pending_actions_expires_at_idx"
  ON "pending_actions"("expires_at");

CREATE TABLE "auth_sessions" (
  "id" TEXT PRIMARY KEY,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "auth_sessions_expires_at_idx"
  ON "auth_sessions"("expires_at");

CREATE TABLE "undo_actions" (
  "id" SERIAL PRIMARY KEY,
  "session_id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "args" JSONB NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "undo_actions_session_id_created_at_idx"
  ON "undo_actions"("session_id", "created_at");
CREATE INDEX "undo_actions_expires_at_idx"
  ON "undo_actions"("expires_at");
