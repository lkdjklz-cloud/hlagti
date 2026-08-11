# حلاقتي (Hlagti)

Live queue + booking for barbershops. RTL Arabic, built from a prototype.

## Stack
- **web** — React 19 + Vite + React Router + socket.io-client
- **server** — Node + Express + Socket.IO + Prisma (SQLite)
- **notify** — Web Push (VAPID) + Email (SMTP, optional)

## Setup
```bash
# 1. install (Node ≥ 20; on Windows use npm.cmd — PowerShell blocks npm.ps1)
npm install                  # root: concurrently for `npm run dev`
npm --prefix server install
npm --prefix web install

# 2. env
copy server\.env.example server\.env
# generate VAPID keys and fill SMTP etc.:
npx.cmd web-push generate-vapid-keys --json

# 3. database + demo data
npm --prefix server run migrate && npm run seed

# 4. run both
npm run dev
# server: http://localhost:3001   web: http://localhost:5173
```

## Demo
- login `demo@barber.test` / `demo1234`
- public shop: `/barber/salon-boumediene`
- dashboard: `/dashboard`

## Scripts
| command | does |
|---|---|
| `npm run dev` | server + web together |
| `npm run seed` | reset demo data |
| `npm run build` | production web build |
| `npm.cmd --prefix server test` | unit tests (queue + notify) |
| `node server/e2e.verify.mjs` | full end-to-end API checks (needs a running server) |

## API highlights
- `GET /api/barbers` · `GET /api/barbers/:slug` · `GET /api/barbers/:slug/queue`
- `POST /api/barbers/:slug/queue/join` · `GET /api/queue/my?token=` · `DELETE /api/queue/:id?token=`
- `GET|POST /api/barbers/:slug/slots` (availability + booking, conflict-safe)
- `POST /api/auth/register/barber|customer` · `POST /api/auth/login` · `GET /api/auth/me`
- `GET /api/dashboard/queue` · `POST /api/dashboard/queue/:id/start|done|cancel` · `POST /api/dashboard/walkin`
- `PATCH /api/dashboard/settings` · `GET|POST /api/dashboard/services` · `GET /api/dashboard/slots`
- `POST /api/push/subscribe|unsubscribe`

## Notes
- Guest ticket = JWT in `localStorage` (`hlagti:ticket:<barberId>`).
- Numbers restart at 1 each day (server-local time).
- Notifications are an outbox row per event; `key` dedupes daily milestones, and position pushes fire per change.
- Web Push needs HTTPS or `localhost`. Email skips (logged) until SMTP is configured.

## Roadmap (next)
- Ratings & reviews, loyalty (9th visit free), discovery page, photos, PostgreSQL.