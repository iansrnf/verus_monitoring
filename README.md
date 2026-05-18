# Verus Monitoring

Next.js dashboard for the Postgres `device` table.

## Setup

Create `.env.local`:

```env
DATABASE_URL=postgres://postgres:password@localhost:5432/verus_monitoring
POSTGRES_SSL=false
CONFIG_API_TOKEN=optional-shared-token-for-mobile-api
```

Optional Fail2Ban monitor settings for Ubuntu:

```env
FAIL2BAN_CLIENT_BIN=/usr/bin/fail2ban-client
FAIL2BAN_TAIL_BIN=/usr/bin/tail
FAIL2BAN_LOG_PATH=/var/log/fail2ban.log
FAIL2BAN_HISTORY_LINES=240
FAIL2BAN_USE_SUDO=false
```

The Fail2Ban page runs on the Ubuntu host where Next.js is deployed. If the service user cannot read Fail2Ban directly, allow only the needed commands with sudo and set `FAIL2BAN_USE_SUDO=true`.

Example sudoers entry, replacing `nextjs` with your service user:

```sudoers
nextjs ALL=(root) NOPASSWD: /usr/bin/fail2ban-client status, /usr/bin/fail2ban-client status *, /usr/bin/tail -n * /var/log/fail2ban.log
```

Run locally:

```bash
npm run dev
```

The dashboard reads from Postgres through the Next.js API routes.
