# Verus Monitoring

Next.js dashboard for the Postgres `device` table.

## Setup

Create `.env.local`:

```env
DATABASE_URL=postgres://postgres:password@localhost:5432/verus_monitoring
POSTGRES_SSL=false
CONFIG_API_TOKEN=optional-shared-token-for-mobile-api
```

Run locally:

```bash
npm run dev
```

The dashboard reads from Postgres through the Next.js API routes.
