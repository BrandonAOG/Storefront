# Always On Generators – online storefront

A 24/7 storefront where customers see upfront prices, pick an arrival window,
pay online, join a maintenance plan, or request a virtual visit. An admin area
lets you manage services, prices, plans, hours and incoming work.

Built with Next.js 16 (App Router), TypeScript, Tailwind CSS, Postgres
(Drizzle ORM) and Stripe Checkout.

## What's in it

**For customers**

| Address | What it does |
| --- | --- |
| `/` | Services with photos and prices, plans, FAQ. Headline can be A/B tested |
| `/services/<name>` | Details, "what's included" checklist, add to booking or get a quote |
| `/book` | Cart → details → arrival window → review → pay |
| `/order/<token>` | Private booking confirmation |
| `/plans`, `/plans/<name>` | Compare plans and subscribe; members can update their card or cancel |
| `/virtual-visit` | Ask for a live call, or send a video for review |
| `/visit/<token>` | Customer's visit page: join the video call, upload photos and video |
| `/call/<token>` | Customer's side of the video call |
| `/quote/<token>` | Personal estimate: tick optional add-ons, accept, pay a deposit |
| `/feedback/<token>` | 0–10 score and comment; happy customers are sent to your review page |
| `/unsubscribe/<token>` | Stop reminders and offers |

**For you (`/admin`)**

| Page | What it does |
| --- | --- |
| Overview | Upcoming jobs and headline numbers |
| Bookings | Every booking; mark completed, paid, cancelled |
| Virtual visits | Requests, built-in video call room with snapshots, measuring on photos, the customer's uploads, notes, "turn into an estimate" |
| Estimates | Build, send, track opened and accepted |
| Memberships | Plan sign-ups and their status |
| Customers | One record per customer with full history, notes and message preferences |
| Feedback | Scores, comments and Net Promoter Score |
| Analytics | Booking funnel, where customers come from, revenue by source, estimate close rate, A/B test results |
| Messages | Edit every email and text, switch each on or off, see what was sent |
| Services, Plans | Prices, photos, descriptions, per-service ZIP codes and notice period |
| Availability | Hours, window length, crews, days off |
| Integrations | What's connected, webhooks, API keys |
| Settings | Business details, service area, deposit, alerts, review link, headline and A/B test |

## Run it locally

You need Node 20.12+ and a Postgres database (local, or a free Neon database).

```bash
npm install
cp .env.example .env        # then fill it in
npm run db:migrate          # creates the tables
npm run db:seed             # loads starter services, plans and hours
npm run dev                 # http://localhost:3000
```

Admin sign-in is at `/admin`, using `ADMIN_PASSWORD` from `.env`.

The starter services, plans, phone number and headline are written from
alwaysongenerators.com (see `scripts/content.ts`). **No prices are set**, because
the website doesn't publish any:

- A bookable service with price 0 shows "Price confirmed before work begins".
- A "free estimate" service leads to the virtual visit form.
- A plan with price 0 shows "Call for pricing" and takes a request, not a payment.

Add real prices in the admin area whenever you want them shown.

If your database still has the first version's made-up content, run
`npm run db:site-content` once. It removes only those original placeholders and
adds the website's content; anything you created yourself is kept.

## Phones and tablets

Built mobile-first and tested on iPhone SE, iPhone 13, iPad Mini and iPad Pro
sizes: no sideways scrolling, 44 px touch targets, 16 px form fields (so iPhones
don't zoom when a field is tapped), tap-to-call, and a bottom bar on phones with
Call and Book buttons. Customers can also add the site to their home screen.

## Settings in `.env`

| Name | Needed | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection string |
| `APP_URL` | yes in production | Public site address, used for Stripe return links |
| `ADMIN_PASSWORD` | yes | Admin password, 12+ characters |
| `SESSION_SECRET` | yes | 32+ random characters used to sign the admin cookie |
| `STRIPE_SECRET_KEY` | optional | Turns on online payment |
| `STRIPE_WEBHOOK_SECRET` | with Stripe | Verifies payment notifications from Stripe |
| `RESEND_API_KEY`, `EMAIL_FROM` | optional | Turns on email |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` | optional | Turns on text messages |
| `BLOB_READ_WRITE_TOKEN` | optional | Turns on photo and video uploads |
| `CRON_SECRET` | optional | Turns on the daily reminder job |

Every optional feature degrades cleanly when it isn't connected. Without Stripe,
bookings are confirmed with payment due at service. Without email or texting,
messages are recorded in **Admin → Messages** but not sent. Without Blob, the
upload buttons are hidden. **Admin → Integrations** shows what is connected.

## Turning on email, texts, uploads and reminders

- **Email:** create a Resend account, verify your domain, create an API key, set
  `RESEND_API_KEY` and `EMAIL_FROM`. Add your postal address in Admin → Settings;
  it is required in reminder and offer emails.
- **Texts:** buy a Twilio number and complete Twilio's A2P 10DLC registration
  (US carriers block unregistered business texting). Set the three `TWILIO_` values.
  Texts only go to customers who ticked "text me updates".
- **Uploads:** in Vercel, Storage → Blob → create a **public** store and connect it
  to the project. That sets `BLOB_READ_WRITE_TOKEN`.
- **Daily reminders:** set `CRON_SECRET` to 16+ random characters. `vercel.json`
  already schedules `/api/cron` once a day at 14:00 UTC. You can also press
  "Run today's reminders now" in Admin → Messages.

## Automated messages

All editable in Admin → Messages.

| Message | Sent |
| --- | --- |
| Booking confirmation | Immediately |
| Virtual visit received | Immediately, with the upload link |
| Estimate delivery | When you press "Save and send" |
| Plan welcome | Immediately |
| Appointment reminder | 1 day before (adjustable) |
| Feedback and review request | 2 days after a job is marked completed |
| Rebooking reminder | 335 days after the last completed job |
| Unfinished booking follow-up | 1 day after an unpaid checkout |
| Win-back | After 540 days of inactivity |
| Loyalty thank-you | After 3 completed jobs |

The last five are marketing messages: they carry an unsubscribe link and stop
when a customer unsubscribes. The same message is never sent twice for the same
booking.

## Webhooks and API

- **Webhooks** (Admin → Integrations) POST JSON to an https address when things
  happen: `order.confirmed`, `order.completed`, `order.cancelled`, `visit.created`,
  `quote.sent`, `quote.accepted`, `membership.created`, `membership.active`,
  `membership.cancelled`, `feedback.received`. Use "Webhooks by Zapier", Make or
  n8n to pass them on to dispatch or accounting software.
  Verify with `X-AOG-Signature: sha256=HMAC_SHA256(secret, timestamp + "." + body)`.
  Failed deliveries are retried by the daily job, up to 5 times.
- **API** is read-only: `GET /api/v1/orders|customers|visits|quotes|memberships|feedback`
  with `Authorization: Bearer <key>`, optional `?limit=` and `?since=`.

## Video calls, snapshots and measuring

- **Call room:** open a virtual visit in the admin area and press **Open call room**.
  The customer presses **Join video call** on their visit page (or you send them
  the link shown in the room). Nothing to install on either side.
- **How it connects:** the two browsers swap small setup messages through this
  app, then audio and video flow directly between them. Nothing is recorded and
  no video passes through or is stored on the server.
- **Networks:** direct connections work on most home and mobile networks. Some
  cellular and office networks block them; to cover those, add a TURN relay
  service by setting `TURN_URLS` (comma-separated `turn:` or `turns:` addresses),
  `TURN_USERNAME` and `TURN_CREDENTIAL`.
- **Snapshots:** press **Snapshot** during a call to save a still of the
  customer's camera to the visit. Quality matches the live video, so ask the
  customer to hold steady.
- **Measuring:** open any snapshot or customer photo. For the best result use a
  **rectangle reference**: tap the four corners of a flat rectangle of known size
  (a sheet of letter paper on the wall, a door, the panel cover) and enter its
  size. The tool corrects for the camera angle, so anything on that same flat
  surface measures correctly even in a tilted photo. A quicker **line reference**
  is also available but is only accurate at the same distance and angle. Neither
  can measure depth between different surfaces. Confirm on site.
- While a call is open each side checks for messages every 1 to 3 seconds, which
  counts toward your hosting plan's function usage.

## Tracking and A/B testing

Each storefront visitor gets an anonymous random id in a first-party cookie
(`aog_vid`). It counts funnel steps and picks the A or B headline. A second
cookie (`aog_attr`) remembers the first source that brought them (`utm_source`,
`utm_campaign`, or the referring site) for 90 days. No names or contact details
are stored against these until the visitor books. Mention these cookies in your
privacy policy.

## Turning on payments

1. In Stripe, copy your secret key into `STRIPE_SECRET_KEY` (use a `sk_test_` key first).
2. Add a webhook endpoint pointing to `https://YOUR-SITE/api/stripe/webhook` with these events:
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `checkout.session.expired`, `customer.subscription.deleted`.
3. Copy that endpoint's signing secret into `STRIPE_WEBHOOK_SECRET`.
4. For local testing: `stripe listen --forward-to localhost:3000/api/stripe/webhook`.

In **Admin → Settings**, "Charged at checkout" sets pay-in-full (100) or a deposit.

## Deploying to Vercel

1. Push this folder to a GitHub repo and import it in Vercel.
2. Add a Postgres database (Neon from the Vercel Marketplace sets `DATABASE_URL` for you).
3. Add the other variables from the table above.
4. Run `npm run db:migrate` and `npm run db:seed` once against the production database.

## How booking works

- Hours, window length, crews per window, lead time and days off are set in **Admin → Availability**.
- A window is full when its bookings reach "Jobs per window".
- With payments on, an unpaid checkout holds its window for 30 minutes, then releases it.
- Two customers can't take the same last spot: the check and the insert run under a database lock.
- Times are in `America/New_York` (change `TIME_ZONE` in `src/lib/format.ts`).

## Security notes

- Prices are always read from the database on the server; the browser only sends service IDs and quantities.
- Every admin page and every admin action checks the signed session cookie (HttpOnly, SameSite=Lax, 12 h).
- All form input is validated with zod. Customer text is rendered as text, never as HTML.
- Links stored from admin forms (meeting, review, image) must be `https://`, so they can't be `javascript:` links.
- Stripe webhooks are rejected unless the signature matches.
- Private customer links use a 192-bit random token and are marked `noindex`, `no-store` and `no-referrer`.
- Outgoing webhooks may only target public https addresses. Private, loopback and link-local addresses are refused when saved and again on every send, and redirects are not followed. A DNS-rebinding window between the check and the request remains; only add addresses you trust.
- API keys are stored as SHA-256 hashes and shown once. The API is read-only and never returns private link tokens.
- The daily job endpoint requires `CRON_SECRET`.
- Server logs never include customer names, addresses, contact details or message text.
- **Uploaded photos and videos are in a public Blob store.** Their addresses contain a long random suffix and are only shown in the admin area and on the customer's own page, but anyone who has an address can open the file. Move to a private store with a signed proxy before storing anything sensitive.
- The rate limiter in `src/lib/ratelimit.ts` is in-memory, so on serverless hosting it only slows abuse.
  Add a Vercel Firewall rate-limit rule for `/book`, `/plans/*`, `/virtual-visit`, `/api/track`, `/api/v1/*` and `/admin/login`.
- No Content-Security-Policy is set yet. Next.js needs a nonce-based policy; see
  `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`.

## Not built

- Sales tax (Stripe Tax can add it at checkout).
- Direct two-way sync with a specific dispatch or calendar product; use webhooks or the API.
- Customer self-service rescheduling or cancellation.
- Individual admin accounts; there is one shared password.
- Call recording, screen sharing and group calls (calls are one customer and one specialist).
- Automatic or AR measuring; measurements are drawn by hand against a reference of known size.
