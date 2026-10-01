# Putting Fako Ride in front of real people

Everything in the code is built and tested. What is left needs accounts in your
name, so it is a list of things to do, in the order they depend on each other.
Each step says how you know it worked.

| Service | What it is for | How it bills |
|---|---|---|
| Neon | the database | you already use it for StudyHub |
| Render | runs the API and the ops console | you already use it for StudyHub; the API needs the paid *starter* plan (see `render.yaml`), the console is free |
| Orange Developer | sign-in texts | prepaid SMS bundles, in francs |
| Fapshi | MoMo and Orange Money | a cut of each transaction, in francs |
| Expo (EAS) | building the app, and push notifications | free tier is enough to start |

## 1. The database — Neon

1. New project, region **AWS Europe Central 1 (Frankfurt)** — the same city as the API.
2. Copy the **direct** connection string, not the one with `-pooler` in the host.
   Prisma's migrations take a lock the pooler cannot hold. Keep `?sslmode=require`.

You do not need to create any tables. The API does that itself on its first start.

## 2. The API — Render

1. Dashboard → **New → Blueprint** → choose this repository. It reads `render.yaml`
   and creates three things: the API, its Redis, and the ops console.
2. Fill in what it asks for. For now, put the Neon string in `DATABASE_URL` and
   leave the Orange and Fapshi fields empty — steps 4 and 5 fill them.
3. The first deploy will **refuse to start** until those are filled. That is on
   purpose: in production the API will not run on the console SMS sender, the fake
   payment provider, or documents on disk, because each of those fails silently
   in front of real people.

**It worked, for now, when** the deploy log shows *All migrations have been
successfully applied* and then the API stops, naming the settings it is missing.
The tables exist at that point, which is all step 3 needs.

**It is fully up when**, after steps 4 and 5, `https://fako-ride-api.onrender.com/health`
answers `{"ok":true,...,"env":"production"}`. If Render gave the service a
different address, use that one everywhere below — including `apps/mobile/eas.json`
and the `/api/*` rewrite for the ops console in `render.yaml`.

## 3. Places, fares and your ops account — once, from this laptop

```sh
cd api
DATABASE_URL="<the Neon direct string>" npx tsx prisma/seed.ts
DATABASE_URL="<the Neon direct string>" npm run admin:grant -- +2376XXXXXXXX "Your Name"
```

Run the seed **once**. It is not part of every deploy because it rewrites the
observed corridor fares, and ops may have corrected those since.

**It worked when** `/fares/from/MOLYKO` lists 13 destinations.

## 4. Sign-in texts — Orange

1. Register an app on **developer.orange.com** and subscribe it to the
   **SMS Cameroon** API. Buy a bundle.
2. **Ask Orange, before you rely on it, whether the bundle delivers to MTN and
   Camtel numbers.** Most riders in Buea are on MTN. If it does not, the code takes
   another aggregator as one new class in `api/src/lib/sms.ts`.
3. In Render: `ORANGE_SMS_CLIENT_ID` and `ORANGE_SMS_CLIENT_SECRET`.
4. Only once Orange has approved a sender name, set `ORANGE_SMS_SENDER_NAME=FAKORIDE`.
   Until then texts arrive from Orange's number.

**It worked when** you open the ops console (`https://fako-ride-ops.onrender.com`),
sign in with the number you made admin in step 3, and the code arrives by text —
then sign in on the app from an MTN number and check that one arrives too.

## 5. Money — Fapshi

1. On **dashboard.fapshi.com**, create a **sandbox** service and put its `apiuser`
   and `apikey` into `api/.env` on this laptop (they are empty there now).
2. `cd api && npm run fapshi:check` — takes 100 XAF in the sandbox, pays 100 XAF
   out, and follows both to a final status. Nothing real moves.
3. When that passes, put the same sandbox keys into Render.
4. Webhook, in the Fapshi dashboard: URL `https://fako-ride-api.onrender.com/payments/webhook`,
   secret = the `FAPSHI_WEBHOOK_SECRET` Render generated (copy it from Render).
5. **Going live is a separate, deliberate step:** ask Fapshi support to switch on
   *Direct Pay* and *payouts* for the live account, swap in the live keys, and set
   `FAPSHI_SANDBOX=false`.

**It worked when** a MoMo trip in the app ends with the driver's balance going up.

## 6. The app — EAS

```sh
npm install -g eas-cli
eas login
cd apps/mobile
eas init          # writes the project id into app.json
```

`eas init` matters for more than builds: until the project id exists, the app
cannot get a push token and quietly registers nothing.

Push notifications on Android go through Firebase. Create a Firebase project, add
an Android app with package `cm.fakoride.app`, download its service account key
(Project settings → Service accounts → Generate new private key), then:

```sh
eas credentials   # Android → production → Google Service Account → FCM V1 → upload the key
```

Then a build you can install straight onto your phone:

```sh
eas build --profile preview --platform android
```

It builds on Expo's servers, not this laptop, and ends with a link to an APK.
`--profile production` makes the bundle for the Play Store.

**It worked when**, signed in as a driver with the app closed and the phone
locked, a booking from another phone makes yours ring within a couple of seconds.
Expo Go cannot do this — Android removed remote push from it in SDK 53 — which is
why the installed build is the test.

## What has not been tested against the real thing

- **Orange**: tested against a stand-in that speaks their documented API. The one
  real call so far was with placeholder credentials, and Orange refused them in
  exactly the shape the code expects.
- **Fapshi**: tested against a stand-in; the sandbox check waits on step 5.1.
- **Expo push**: tested against a stand-in; a real phone waits on step 6.
- **The container** was built and run here against an empty database: migrations
  applied, places and fares served, a restart applied nothing twice, and the
  health check reported healthy.
