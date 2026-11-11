# Always On Generators – online storefront

A 24/7 storefront where customers see upfront prices, pick an arrival window,
pay online, join a maintenance plan, or request a virtual visit. An admin area
lets you manage services, prices, plans, hours and incoming work.

Built with Next.js 16 (App Router), TypeScript, Tailwind CSS, Postgres
(Drizzle ORM) and Stripe Checkout.

## What's in it

| Area | Address | What it does |
| --- | --- | --- |
| Storefront | `/` | Services grouped by category with prices, plans, FAQ |
| Service page | `/services/<name>` | Details and "Add to booking" (or "Get a quote") |
| Booking | `/book` | Cart → details → arrival window → review → pay |
| Confirmation | `/order/<token>` | Private link showing the booking and payment state |
| Plans | `/plans`, `/plans/<name>` | Compare plans and subscribe |
| Virtual visit | `/virtual-visit` | Request a remote consultation |
| Admin | `/admin` | Overview, bookings, visits, memberships, services, plans, availability, settings |

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

**The seeded prices, descriptions and plan features are placeholders.** Replace
them in the admin area before customers see the site.

## Settings in `.env`

| Name | Needed | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection string |
| `APP_URL` | yes in production | Public site address, used for Stripe return links |
| `ADMIN_PASSWORD` | yes | Admin password, 12+ characters |
| `SESSION_SECRET` | yes | 32+ random characters used to sign the admin cookie |
| `STRIPE_SECRET_KEY` | optional | Turns on online payment |
| `STRIPE_WEBHOOK_SECRET` | with Stripe | Verifies payment notifications from Stripe |

Without Stripe keys the site still works: bookings are confirmed with payment
due at service, and plan sign-ups arrive as requests.

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
- Stripe webhooks are rejected unless the signature matches.
- Confirmation links use a 192-bit random token and are marked `noindex` / `no-store`.
- Server logs never include customer names, addresses or contact details.
- The rate limiter in `src/lib/ratelimit.ts` is in-memory, so on serverless hosting it only slows abuse.
  Add a Vercel Firewall rate-limit rule for `/book`, `/plans/*`, `/virtual-visit` and `/admin/login`.
- No Content-Security-Policy is set yet. Next.js needs a nonce-based policy; see
  `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`.

## Not built yet

- Email or text confirmations to the customer and new-booking alerts to you.
- Sales tax (Stripe Tax can add it at checkout).
- Dispatch or calendar sync (Google Calendar, Housecall Pro, ServiceTitan and the like).
- Customer self-service rescheduling or cancellation.
- Individual admin accounts; there is one shared password.
- Photo upload and in-app video for virtual visits; you paste in a Zoom, Meet or Teams link.
