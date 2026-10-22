# Deployment

The app needs Node.js 20+, PostgreSQL, HTTPS for microphone/PWA support, and the environment variables in `.env.example`.

## Docker

1. Copy `.env.example` to `.env` and set the Groq key and production model values.
2. Run `docker compose up --build`.
3. Check `/api/health`; it returns `{ "ok": true }` when PostgreSQL is reachable.

The container runs `prisma migrate deploy` before starting Next.js. Persist the PostgreSQL volume and back it up before upgrades. Place the app behind an HTTPS reverse proxy for installation and microphone access.
