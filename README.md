# حلاقتي (Hlagti)

Live queue + booking for barbershops. RTL Arabic, built from a prototype.

## Stack
- **web** — React 19 + Vite + React Router + socket.io-client
- **server** — Node + Express + Socket.IO + Prisma (SQLite)
- **notify** — Web Push (VAPID) + Email (SMTP, optional)

## Getting started from scratch

Prerequisites: **Node.js ≥ 20** (tested on v24). On Windows always use `npm.cmd`
(PowerShell blocks the `npm.ps1` shim).

```bash
# 0. check node is installed
node -v

# 1. install dependencies (root, server, web)
npm.cmd install
npm.cmd --prefix server install
npm.cmd --prefix web install

# 2. configure the server env
copy server\.env.example server\.env
#   - VAPID keys are only needed for browser push notifications (optional locally):
#       npx.cmd web-push generate-vapid-keys --json   → paste into server\.env
#   - SMTP (email) is optional; leave empty to skip emails (they are logged)

# 3. create the SQLite database + demo data
npm.cmd --prefix server run migrate
npm.cmd run seed

# 4. run both (server + web together)
npm.cmd run dev
#   leave this window open; press Ctrl+C to stop both
```

Then open:
- **App / home:** `http://localhost:5173`
- **Public shop (customer):** `http://localhost:5173/barber/salon-boumediene`
- **Barber dashboard:** `http://localhost:5173/dashboard` → login `demo@barber.test` / `demo1234`

> Already running and you want to restart it manually? Kill the old processes first:
> `Get-Process node | Stop-Process -Force` · then `npm.cmd run dev`.

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
| `npm --prefix server run migrate` | apply DB migrations |
| `node server/e2e.verify.mjs` | full end-to-end API checks (needs a running server) |

## API highlights
- `GET /api/barbers` · `GET /api/barbers/:slug` · `GET /api/barbers/:slug/queue`
- `POST /api/barbers/:slug/queue/join` · `GET /api/queue/my?token=` · `DELETE /api/queue/:id?token=`
- `GET|POST /api/barbers/:slug/slots` (availability + booking, conflict-safe)
- `POST /api/auth/register/barber|customer` · `POST /api/auth/login` · `GET /api/auth/me`
- `GET /api/dashboard/queue` · `POST /api/dashboard/queue/:id/start|done|cancel` · `POST /api/dashboard/walkin`
- `GET /api/dashboard/appointments` (upcoming bookings) · `POST /api/dashboard/slots/:id/arrive|done|cancel`
- `GET /api/dashboard/notifications` · `POST /api/dashboard/notifications/read`
- `GET /api/dashboard/loyalty` (per-customer paid/free visits)
- `PATCH /api/dashboard/settings` (incl. `loyaltyEvery`) · `GET|POST /api/dashboard/services` · `GET /api/dashboard/slots`
- `POST /api/push/subscribe|unsubscribe`

## Notes
- Guest ticket = JWT in `localStorage` (`hlagti:ticket:<barberId>`).
- Numbers restart at 1 each day (server-local time).
- Notifications are an outbox row per event; `key` dedupes daily milestones, and position pushes fire per change.
- New barbers get default working hours (09:00–22:00) and 3 starter services on signup.
- Loyalty: free haircut after N **paid** visits (set `loyaltyEvery` in settings). A visit marked "free" doesn't count toward the next reward.
- Web Push needs HTTPS or `localhost`. Email skips (logged) until SMTP is configured.

## Roadmap (next)
- Ratings & reviews, discovery page, photos, PostgreSQL.