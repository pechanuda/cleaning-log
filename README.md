# Cleaning Log

Mobile-first household cleaning tracker built with Next.js and Postgres.

## Stack

- Next.js App Router on Vercel
- Postgres locally via Docker and in production via Supabase
- Cookie-based member selection, no authentication

## Quick Start

1. Copy `.env.example` to `.env`.
2. Start Postgres:

```bash
docker compose up db -d
```

3. Install dependencies:

```bash
npm install
```

4. Initialize and seed the database:

```bash
npm run db:init
npm run db:seed
```

5. Start the app:

```bash
npm run dev
```

## Docker Compose

Start the full local stack:

```bash
docker compose up --build
```

The Compose setup now waits for Postgres health before starting the app, and the DB scripts also retry the connection during startup.

## Household Config

The app reads household seed data from the JSON path in `HOUSEHOLD_CONFIG_PATH`.

Example:

```json
{
  "householdName": "Home Base",
  "members": ["Alice", "Bob", "Charlie"],
  "tasks": [
    { "name": "Kitchen wipe", "size": "XS" },
    { "name": "Laundry", "size": "M" },
    { "name": "Bathroom deep clean", "size": "L" }
  ]
}
```

Seed JSON is bootstrap-only. After seeding, the database is the runtime source of truth.
