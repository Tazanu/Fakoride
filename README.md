# Fako Ride

Bendskin-hailing for Fako Division, Cameroon. Motos first, fixed zone-pair fares,
cash accepted, and drivers pay a flat daily access fee instead of a per-trip commission.

This repo currently holds the **backend spine**: the data model, the Fako gazetteer,
the fare engine, trip lifecycle and dispatch. The rider and driver apps come after.

## Why it is built this way

Four findings from the opportunity research drive almost every decision here:

| Finding | What it forces |
| --- | --- |
| Buea bendskins price by **gradient**, not distance | Fares are a **fixed directed zone-pair table**. Uphill costs more than the same trip downhill. There is no meter. |
| Cash is the habit; internet penetration is ~42% | `CASH` is a first-class `PaymentMethod`. The driver holds the money; we take rent the next morning. |
| An **S10 licence** is required to dispatch paid trips | Driver verification (CNI, plate, licence) is in the model from day one, not bolted on. |
| Ghost-town Mondays suppress movement | Access fees are charged **per service day actually worked**, never per calendar day. A quiet Monday costs a driver nothing. |

Full brief: the "Fako Ride Opportunity Brief" artifact.
Screens: the "Fako Ride Screens" canvas.

## Layout

```
api/
  prisma/schema.prisma     data model
  prisma/seed.ts           seeds zones, landmarks and the fare table
  src/data/fako.ts         the gazetteer — zones, landmarks, elevations
  src/lib/time.ts          service days in Cameroon time — the access fee depends on it
  src/modules/             auth, geo, fares, drivers, dispatch, trips, ledger,
                           demand, safety (SOS + complaints), share
  src/realtime.ts          socket.io: driver positions, offers, trip state
design/
  tokens.json              the Daylight design system — source of truth
  tokens.ts                typed access for the apps and the ops console
  check-contrast.mjs       asserts every colour pair against its WCAG floor
  mockups/                 the screens as editable HTML artboards
```

Read `design/README.md` before building any screen. Six rules, each with the
research behind it — the short version is: light ground because the app is used
in equatorial sun, the phone's own font because our riders are on Android Go
handsets paying by the megabyte, green actions because MTN yellow and Orange
orange already sit on the payment screen, and 48 dp targets with 14 sp minimum
type because thumbs are not cursors.

## What backs each screen

Every endpoint here exists because a mockup needs it. If you add one that no
screen asks for, it is probably not needed yet.

| Screen | Endpoints |
| --- | --- |
| Rider — home | `GET /geo/notices`, `GET /demand/nearby`, `GET /trips/repeats`, `GET /fares/from/:zoneCode` |
| Rider — confirm fare | `GET /fares/quote`, `POST /trips` |
| Rider — on the trip | `GET /trips/:id`, `POST /trips/:id/share`, `POST /trips/:id/sos`, socket `trip:watch` + `trip:position` |
| Rider — arrived & rate | `POST /trips/:id/rate`, `POST /complaints` |
| Rider — trips tab | `GET /trips` |
| Watching a shared trip | `GET /share/:token` — no sign-in, no PIN, no phone numbers |
| Driver — online & offer | `POST /drivers/online`, `GET /drivers/me/today`, `GET /demand/zones`, socket `trip:offer`, `POST /trips/:id/accept`, `POST /trips/:id/decline` |
| Driver — pick up & ride | `POST /trips/:id/arrived`, `POST /trips/:id/start` (the PIN gate), `POST /trips/:id/complete` |
| Driver — earnings | `GET /drivers/me/week`, `GET /drivers/me/earnings` |
| Ops — verification queue | `GET /admin/drivers`, `POST /admin/drivers/:id/verify` · `/reject` · `/suspend` · `/reinstate` |
| Ops — fare-table editor | `GET /admin/fares`, `PUT /admin/fares` |
| Ops — live trip board | `GET /admin/trips` |
| Ops — complaints & SOS | `GET /admin/complaints`, `POST /admin/complaints/:id/respond`, `GET /admin/sos`, `POST /admin/sos/:id/resolve` |
| Ops — service banner | `POST /admin/notices`, `DELETE /admin/notices/:id` |

Two things are deliberately absent. Mobile money is not wired to Fapshi yet, so
a `MOMO` trip records a `FARE_MOBILE` ledger row without anybody being charged;
and nothing collects the access fee once it is raised. Both are money, and money
gets built against a sandbox, not against a guess.

## Becoming an admin

There is no endpoint that grants the `ADMIN` role, and there should never be one.
An API that can promote its own users is one stolen phone away from a stranger
approving drivers and rewriting the fare table.

```bash
cd api
npm run admin:grant -- +237670000000 "Ops Desk"
npm run admin:grant -- +237670000000 --revoke
```

Running that needs shell access to a machine that already holds `DATABASE_URL`,
which is a far higher bar than a bearer token. The person then signs in the
normal way — phone number, code by SMS. One account cannot both approve drivers
and be one, so ops uses a separate number.

Verification is the one route into `ACTIVE`, and it will not accept a driver
without an **S10 licence number** typed off the card. That is not ceremony: an
S10 is what makes a paid moto trip legal here, and a checkbox gets ticked from a
desk while a number has to be read off a document somebody is holding.

## Running it

```bash
docker compose up -d      # PostGIS on 5433, Redis on 6379

cd api
cp .env.example .env      # the defaults already point at those two
npm install
npx prisma migrate dev
npm run seed
npm run dev               # http://localhost:4000/health
```

Postgres is on **5433**, not 5432, because a dev machine usually already has a
local PostgreSQL on the default port and the one thing worse than no database is
quietly migrating the wrong one.

The first migration runs `CREATE EXTENSION IF NOT EXISTS "postgis"` itself, so a
fresh Neon branch needs nothing done to it by hand — point `DATABASE_URL` at it
and migrate. Production is Neon and Upstash; `docker-compose.yml` is local only.

## Tests

```bash
cd api
npm test              # pure arithmetic — needs nothing running
npm run test:integration   # real HTTP, real Postgres, real Redis
```

`npm test` covers the fare formula, the Cameroon service-day boundaries, the
demand labels and the weekly earnings fold. No database, no network, under three
seconds.

`npm run test:integration` walks three stories end to end — one complete trip
from OTP to complaint, a driver cancelling mid-trip, and the whole ops console —
and it exists because the bugs worth catching here only live *between*
processes. It has already caught two: a driver suspended in Postgres but still
sitting in the Redis geo set, and dispatch giving up with bikes available
because the one nearest driver was ineligible.

**It resets the database first**, and refuses to run unless `DATABASE_URL`
points at localhost. Every suite asserts on exact counts, and a suite that only
passes on a clean database but is run against a dirty one tells you nothing.

## The fare table is seeded, not decided

`src/data/fako.ts` holds zone centroids and elevations that are **approximate desk
estimates**, and `seed.ts` generates fares from a documented formula:

```
price = round50(120 + 60 × road_km + 80 × (climb_m / 100))   floor 200 XAF
```

That formula was tuned to reproduce the fares people actually quote on the Molyko
corridor today. It exists to give the table a sane starting shape — **not** to be
correct. Every row carries `source: FORMULA` until someone walks the corridor and
corrects it, at which point the row becomes `source: FIELD` and the formula never
touches it again.

Same for coordinates: replace them with GPS points taken on site before launch.

## Conventions

- **Money is an integer in XAF.** The franc has no subunit; there are no decimals
  and no floats anywhere near a fare.
- **Trips are append-only.** Every state change writes a `TripEvent`. A driver's
  phone losing signal mid-trip must never lose the fare record.
- **Zones are the unit of geography**, not addresses. Nobody in Buea navigates by
  street name.
