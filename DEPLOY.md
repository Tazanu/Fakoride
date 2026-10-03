# Putting Fako Ride in front of real people

Everything in the code is built and tested — 96 unit checks and 328 end-to-end
checks pass. What is left needs accounts in your name. The steps are in the order
they depend on each other, and the slow sign-ups come first so you are not
waiting on them at the end. Each step says how you know it worked.

Commands are typed in the VS Code terminal (PowerShell is fine), from the
`fako-ride` folder unless a step says otherwise.

| Service | What it is for | How it bills |
|---|---|---|
| Orange Developer | sign-in codes and trusted-contact texts | prepaid SMS bundles, in francs |
| Fapshi | MoMo and Orange Money | a cut of each transaction, in francs |
| Neon | the database | you already use it for StudyHub |
| Render | runs the API and the ops console | you already use it for StudyHub; the API needs the *starter* plan (about $7 a month), the console is free |
| Expo (EAS) + Firebase | building the app, and push notifications | free tiers are enough to start |

## 1. Start the slow sign-ups — today

These take days to approve, so start them first and do the rest while you wait.

- **Orange:** create an account on **developer.orange.com**, create an app, and
  subscribe it to the **SMS Cameroon** API. Buy a bundle. Ask them, in writing:
  *"Does this bundle deliver to MTN and Camtel numbers?"* Most riders in Buea are on
  MTN. If the answer is no, another aggregator is one new file in
  `api/src/lib/sms.ts`.
- **Fapshi:** create an account on **dashboard.fapshi.com**. The sandbox works at
  once; live payments need their verification.

## 2. Fapshi sandbox — about 10 minutes

1. In the Fapshi dashboard, create a **sandbox** service. Copy its `apiuser` and
   `apikey`.
2. Open `api/.env` and paste them between the quotes on `FAPSHI_API_USER=""` and
   `FAPSHI_API_KEY=""`.
3. Run:
   ```
   cd api
   npm run fapshi:check
   ```
   It takes 100 XAF in the sandbox, pays 100 XAF out, and follows both to the end.
   Nothing real moves.

**It worked when** it ends with `collect: SUCCESSFUL`.

## 3. The database — Neon

1. New project. Region **AWS Europe Central 1 (Frankfurt)**.
2. Copy the connection string **without `-pooler`** in it.
3. Create a file `api/.env.production` with one line:
   ```
   DATABASE_URL="postgresql://...neon.tech/neondb?sslmode=require"
   ```
   Git ignores this file, so the address never goes into a commit. Do not paste it
   into a chat.

## 4. Fill the database — one command

```
cd api
npm run setup:production -- +2376XXXXXXXX "Your Name"
```

Use your own number. It builds the tables, loads Fako's 14 places and 182 fares,
and makes your number an admin of the ops console. Running it again is safe: it
never reloads fares into a database that already has them, so fares you correct
later are never overwritten.

**It worked when** it prints `Done.`

## 5. Render

1. Dashboard → **New → Blueprint** → choose the **Fakoride** repository, branch
   **main**. It reads `render.yaml` and creates three things: the API, its Redis,
   and the ops console.
2. Paste the same Neon address into `DATABASE_URL`.
3. Leave the Orange and Fapshi fields empty until steps 6 and 7.
4. The plan is set to **starter**. The free plan sleeps after 15 idle minutes, and
   while asleep offers stop moving to the next driver and payments stop being
   checked. To start on free anyway, change `plan: starter` to `plan: free` in
   `render.yaml`.

The API **will not start** until steps 6 and 7 are done. That is on purpose: in
production it refuses to run with no real SMS or no real payments, because both
would fail silently in front of real people.

**If Render gives the API a different address** than `fako-ride-api.onrender.com`,
tell me — it appears twice in `render.yaml` and twice in `apps/mobile/eas.json`.

## 6. Sign-in texts — when Orange's keys arrive

1. In Render, on the API, set `ORANGE_SMS_CLIENT_ID` and `ORANGE_SMS_CLIENT_SECRET`.
2. Only once Orange has approved a sender name, also set
   `ORANGE_SMS_SENDER_NAME=FAKORIDE`. Until then texts come from Orange's number.

**It worked when** you open `https://fako-ride-ops.onrender.com`, sign in with the
number from step 4, and the code arrives by text. Then sign in on the app from an
MTN number and check that one arrives too.

## 7. Money on Render

1. In Render, set `FAPSHI_API_USER` and `FAPSHI_API_KEY` — the sandbox keys from
   step 2.
2. In the Fapshi dashboard, set the webhook URL to
   `https://fako-ride-api.onrender.com/payments/webhook`, and the secret to the
   `FAPSHI_WEBHOOK_SECRET` that Render generated (copy it from Render).

**It worked when** `https://fako-ride-api.onrender.com/health` answers
`{"ok":true,...,"env":"production"}`.

## 8. The phone app

1. Create a free account on **expo.dev**.
2. Create a project on **console.firebase.google.com**, add an **Android** app with
   package name `cm.fakoride.app`, then Project settings → Service accounts →
   **Generate new private key**. Keep the downloaded file.
3. In the terminal (these ask for your password, so you type them):
   ```
   npm install -g eas-cli
   eas login
   cd apps/mobile
   eas init
   eas credentials
   ```
   In `eas credentials` choose Android → production → Google Service Account →
   FCM V1, and give it the Firebase file.
4. Build the app:
   ```
   eas build --profile preview --platform android
   ```
   It builds on Expo's servers, not your laptop, and ends with a link. Open the
   link on your phone and install the APK.

`eas init` writes a project id into `app.json` — commit that change.

## 9. Test on real phones

- Sign in on two phones: one as a rider, one as a driver.
- Lock the driver's phone with the app closed, then book from the rider's phone.
  **The driver's phone should ring within a couple of seconds.**
- Do a MoMo trip (sandbox), switch the app to French, and share a trip link.
- On the account screen, save a trusted contact, start a ride and press Get help.
  The contact should get a text with a link that opens the ride.

## 10. Before real customers

- A lawyer reviews the Terms and Privacy pages in the app (English and French).
- Create the `hello@fakoride.cm` and `privacy@fakoride.cm` mailboxes — both pages
  name them.
- Ask what Law No. 2024/017 requires for storing data in Frankfurt, outside
  Cameroon.
- Check the 182 fares against real prices on the road and correct them in the ops
  console (Fare rules). Every one is a formula estimate today.
- Ask Fapshi support to switch on **Direct Pay** and **payouts** for your live
  account. Then put the live keys in Render and set `FAPSHI_SANDBOX` to `false`.

## Known limitations, on purpose

- **The real map only shows in the installed app.** The build from step 8 draws
  OpenStreetMap from a 2.8 MB file of Fako bundled inside the app — no map bill,
  works without signal — with her dot, the taxi and where she is going. Expo Go
  cannot load the map library, so there it shows the old drawing instead. The map
  has compiled and bundled here but has never run on a phone: step 8's build is its
  first real test, so look at the map closely then.
- **Ready for a second API server, not using one.** Render's starter plan runs one.
  If load ever needs two, raise the instance count in Render: live connections
  are shared through Redis and each background job runs on one server at a time,
  both tested with two servers running together.
- **A driver has 12 seconds to accept.** Opening the app from a locked phone may
  need longer; change `OFFER_TTL_SECONDS` in Render after watching real drivers.
- **Library advisories left open:** in the API, one inside Prisma's command-line
  tool (fixed only in Prisma 8, a breaking upgrade, and never reachable from a
  request); in the app, a few inside Expo's build tools, plus one in the router
  where a crafted `fakoride://` link could freeze the app until it is reopened. The
  fixed versions do not fit this Expo version; an Expo upgrade will bring them.
  The ops console has none.
