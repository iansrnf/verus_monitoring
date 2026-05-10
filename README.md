# Verus Monitoring

Next.js dashboard for the Supabase `device` table.

## Setup

Create `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
CONFIG_API_TOKEN=optional-shared-token-for-mobile-api
```

Run locally:

```bash
npm run dev
```

The dashboard reads from the `device` table and listens for Supabase Realtime changes.
