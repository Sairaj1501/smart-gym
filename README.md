# AI-Powered Smart Gym Management System

A database-driven gym platform: memberships, attendance, payments, trainers, member health tracking, rule-based diet and workout planners, attendance-drop alerts, reports and an optional AI-assisted chatbot. Built for a PBL competition on **React + Express + MongoDB**.

> **Demo data.** `npm run seed` fills the database with *sample* members, payments and attendance. The app shows a banner while demo data is active. None of it is real.

## What is real AI and what is not (say this to the judges)

| Feature | How it works | Uses a trained model? |
|---|---|---|
| Diet planner | Mifflin-St Jeor calorie estimate, modest goal adjustment, safe calorie floor, allergen filtering over a sample food table | **No** (deterministic rules) |
| Workout planner | Split templates chosen by goal, level, days, equipment and duration | **No** (deterministic rules) |
| Attendance/engagement alerts | Compares recent visits/week with the previous 4 weeks using configurable thresholds | **No** (statistics on real check-ins) |
| Progression suggestions | "Two clean top-of-range sessions, no discomfort → small load increase" | **No** (rules) |
| Chatbot | If `ANTHROPIC_API_KEY` is set, an LLM answers using only the signed-in member's own context. Otherwise a keyword-rule fallback answers | **Optional LLM** |
| Plan/progress explanations | Optional LLM *rewrites in plain language* a plan the rules already built. It cannot change foods, calories or exercises | **Optional LLM** |

Nothing breaks without an API key. The key lives only in the server `.env`.

## Quick start (Windows/macOS/Linux)

Prerequisites: **Node.js 22+**, and either local MongoDB or a free MongoDB Atlas cluster.

```bash
# 1. API
cd server
npm install
cp .env.example .env        # Windows: copy .env.example .env
#   edit .env: set MONGODB_URI and a long random JWT_SECRET (command is in the file)
npm run seed                # wipes the DB named in MONGODB_URI and loads demo data
npm run dev                 # http://localhost:5000

# 2. Web app (new terminal)
cd client
npm install
npm run dev                 # http://localhost:5173
```

Demo logins (created by the seed, password policy shown on screen):

| Role | Email | Password |
|---|---|---|
| Owner/admin | admin@smartgym.demo | Admin@123 |
| Receptionist | staff@smartgym.demo | Staff@123 |
| Trainer | trainer1@smartgym.demo | Trainer@123 |
| Member | member1@smartgym.demo | Member@123 |

`member1` is seeded as an *inactive* pattern and `member2` as *declining*, so the follow-up alerts have something real to show. **Change or remove these accounts before any real use.**

## Tests

```bash
cd server
npm run test:unit          # pure logic, no database needed
npm run test:integration   # API + MongoDB; downloads a mongod binary on first run
npm test                   # both
```

See `docs/TEST_EXECUTION_LOG.md` for what has and has not been executed.

## Roles and what they can do

| Area | Admin | Staff | Trainer | Member |
|---|---|---|---|---|
| Members | all, deactivate | register, edit non-sensitive | assigned only (read) | own profile |
| Health data | read + audit-logged | **none** | assigned only | own only |
| Plans / memberships | manage | assign, renew, change | - | view own |
| Payments | all, refund | record, receipts | - | own history |
| Attendance | all | check in/out | assigned | own + QR |
| Workout/diet plans | review all | - | review assigned | generate, log |
| Revenue, settings, audit log | yes | no | no | no |

Authorization is enforced on the server for every route; member IDs from the browser are never trusted.

## Project layout

```
server/src
  models/index.js        all Mongoose schemas, indexes, history rules
  routes/*.js            REST endpoints (auth, members, memberships, attendance, payments, ...)
  services/              business logic (membership, payments, engagement, diet/workout engines, reminders, llm)
  utils/                 pure helpers (dates, BMI, engagement maths, CSV)
  middleware/            JWT auth, role + object-level access, error mapping
  seed.js                demo data
client/src
  pages/                 one file per screen
  components/            layout, charts, UI kit, chat widget, member picker
```

## API overview

`POST /api/auth/login` · `GET /api/auth/me` · `POST /api/members` · `GET /api/members` · `GET|PUT /api/members/:id` · `DELETE /api/members/:id` (deactivates) · `GET|POST|PUT /api/plans` · `POST /api/memberships` · `POST /api/memberships/:id/renew` · `POST /api/memberships/member/:id/change-plan` · `POST /api/attendance/check-in` · `GET /api/attendance/engagement` · `POST /api/payments` · `GET /api/payments/:id/receipt` · `POST|GET /api/health-metrics` · `GET /api/fitness-progress/:memberId` · `POST /api/workout-plans/generate` · `POST /api/diet-plans/generate` · `PUT /api/*-plans/:id/review` · `POST /api/sessions` · `GET /api/notifications` · `GET /api/analytics/dashboard` · `GET /api/reports/:type?format=csv` · `POST /api/chat`.

## Deployment (all free tiers; none is assumed to exist)

1. **Database:** MongoDB Atlas free cluster. Create a DB user, allow your host's IP (or 0.0.0.0/0 for a demo), copy the `mongodb+srv://` string.
2. **API:** Render, Railway or Fly. Root `server`, build `npm install`, start `npm start`. Env vars: `MONGODB_URI`, `JWT_SECRET`, `NODE_ENV=production`, `CLIENT_ORIGIN=<your web URL>`, optional `ANTHROPIC_API_KEY`. Free instances sleep when idle, so the first request after a pause is slow.
3. **Web:** Vercel or Netlify. Root `client`, build `npm run build`, output `dist`, env `VITE_API_URL=<your API URL>`. Add a rewrite of all paths to `/index.html` so deep links work.
4. Run `npm run seed -- --force` once **only** if you want demo data on the hosted database.

## Troubleshooting

- *"JWT_SECRET must be set"*: copy `.env.example` to `.env` and set a 32+ character secret.
- *Cannot connect to MongoDB*: start `mongod`, or check the Atlas IP allow-list and password (URL-encode special characters).
- *Web shows "Cannot reach the server"*: the API is not running, or `VITE_API_URL` / `CLIENT_ORIGIN` do not match.
- *Duplicate key errors after changing schemas*: re-run `npm run seed` in development.

## Decisions where this deviates from the original brief, and why

1. **No multi-document transactions.** They need a MongoDB replica set, which a default local install is not. Payments are protected instead by idempotency keys, a guarded atomic balance update that refuses overpayment even under concurrency, and compensating rollback.
2. **`/api/auth/register` is admin-only.** A public endpoint that accepts a role is a privilege-escalation hole. Members are created by staff and trainers by the admin; each gets a one-time temporary password they must change.
3. **`bcryptjs`** instead of `bcrypt`: same algorithm and hash format, no native build step on Windows.
4. **"Pending / partially paid" are derived** from amount due vs amount paid per membership instead of being stored per payment. "Failed" does not apply without a payment gateway.
5. **Fitness assessments** are health records flagged as assessments with a trainer observation, not a separate collection. Staff and admins are `User` roles; trainers also have a `Trainer` profile.
6. **Plan edits never rewrite history:** each membership stores a snapshot of the plan's price and duration.

## Known limitations (be upfront about these)

Not implemented: payment gateway, email/SMS (notifications are in-app only and say so), progress photos, expenses, camera QR scanning (paste or hardware-scanner input works), server-side PDF (use browser *Print → Save as PDF*), proration on plan change, multi-branch. The reminder scheduler runs inside the API process (fine for one instance). Date filters on payments and sessions assume India time (+05:30); attendance and analytics respect the configurable time zone. The JWT is kept in `localStorage`, which is acceptable for a student project but weaker than an HttpOnly cookie. Food values are approximate sample data, not a validated nutrient database. The frontend has been syntax-checked but not built or run in a browser by the author of this repository snapshot (see the test log).
