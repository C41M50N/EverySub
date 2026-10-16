# EverySub

EverySub helps you see what your subscriptions cost, when they renew, and how those charges add up. It brings subscription details, upcoming invoices, recorded billing history, and spending trends into one place.

The project is in development and currently serves one person, while being built as an open source product and portfolio project. See [PRODUCT.md](PRODUCT.md) for the product direction and decision principles.

## What works today

- Start tracking without setup. New accounts get a Personal collection with starter categories and a dashboard welcome that leads with import, with manual entry right beside it. After the first save, a one-time prompt offers guided reminder setup.
- Organize subscriptions in collections and categories. Add, edit, deactivate, reactivate, delete, and move them between collections. Every account keeps at least one collection.
- Track weekly, monthly, yearly, and biennial billing schedules in USD. See effective monthly and yearly costs and the next expected charge.
- Review collection dashboards with cost metrics, spending trends, category breakdowns, upcoming invoices, and recently recorded invoices.
- Explore projected upcoming invoices and recorded invoice history separately. Recorded entries are schedule snapshots; EverySub does not verify payment.
- Import and export subscriptions as JSON or CSV. An optional smart import finds candidates in statements, receipts, and screenshots, then lets you review them before saving.
- Get renewal reminders and a monthly overview by email, Discord, or a signed webhook. Each collection chooses where its notifications go, and each subscription can be excluded from them.

## Stack

TanStack Start and Router, React, TanStack Query, Better Auth with Google sign-in, Drizzle ORM and PostgreSQL, Tailwind CSS, optional OpenAI-powered import, and React Email with Resend for notification emails. Bun runs the local scripts. Portless provides local HTTPS.

## Local setup

Install [Node.js 24 or newer](https://nodejs.org/en/download) and [Bun](https://bun.sh). If you use nvm, run `nvm install` and `nvm use` to select the Node 24 version declared in `.nvmrc`.

Install dependencies and create `.env.local` in the project root. [`.env.schema`](.env.schema) defines the required and optional variables.

```bash
bun install
```

```dotenv
DATABASE_URL=
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=https://dev.everysub.com
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Optional: enables smart import
OPENAI_API_KEY=
# Optional: subscription brand icons
LOGO_DEV_SECRET_KEY=
LOGO_DEV_PUBLISHABLE_KEY=

# Optional: enables email notifications
RESEND_API_KEY=
RESEND_FROM_ADDRESS="EverySub <notifications@mail.example.com>"
RESEND_WEBHOOK_SECRET=
```

Set the Google OAuth callback URL to `https://dev.everysub.com/api/auth/callback/google`. Apply the existing Drizzle migrations to your local database with `bun run db:migrate`.

```bash
bun run dev
```

The app runs at **https://dev.everysub.com**. The dev script requests `.com` (alongside `.dev` and `.localhost`) and registers `dev.everysub`. Portless manages the local HTTPS certificate and hosts entry. If an existing Portless proxy was started without `.com` support, restart it from an interactive terminal before running the app:

```bash
bunx portless proxy stop
bunx portless proxy start --tld com --tld dev --tld localhost
```

Portless may ask for your system password because the HTTPS proxy uses port 443. Restarting the shared proxy may briefly disconnect other local Portless apps.

## Scripts

| Command                    | Purpose                                    |
| -------------------------- | ------------------------------------------ |
| `bun run dev`              | Start the local HTTPS app                  |
| `bun run build`            | Build the production app                   |
| `bun run start`            | Serve the production build                 |
| `bun run test`             | Run Vitest tests                           |
| `bun run lint`             | Run Oxlint                                 |
| `bun run fmt:check`        | Check formatting with Oxfmt                |
| `bun run db:migrate`       | Apply existing Drizzle migrations          |
| `bun run db:push`          | Push the current schema during development |
| `bun run db:studio`        | Open Drizzle Studio                        |
| `bun run jobs:run`         | Record due invoices and send notifications |
| `bun run invoices:process` | Record due invoice snapshots only          |
| `bun run email:dev`        | Preview notification emails                |
| `bun run import:eval`      | Run the smart import evaluation script     |

`db:generate` exists for authoring migrations, but should only be run when explicitly requested by the project owner.

## Notifications

Notifications are scheduled by one recurring job, `bun run jobs:run`, which [Railway IaC](.railway/railway.ts) runs every five minutes. Each run records due invoices in each user's time zone, creates the reminders and overviews whose 9 a.m. local send time has arrived, and delivers them with retries. Five minutes is frequent enough to reach 9 a.m. in time zones offset by 30 or 45 minutes and to space retries over about an hour.

Email needs a [Resend](https://resend.com) account:

1. Verify the sending domain in Resend and set `RESEND_FROM_ADDRESS` to an address on it. Leave open and click tracking off for that domain; EverySub keeps email unavailable while either is on.
2. Create an API key for `RESEND_API_KEY`. A full-access key lets EverySub confirm the domain is ready; a sending-only key works too.
3. Add a Resend webhook pointing to `https://<your-host>/api/webhooks/resend` with the `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.complained`, `email.failed`, and `email.suppressed` events. Put its signing secret in `RESEND_WEBHOOK_SECRET`. Email stays unavailable without it, because bounces and complaints couldn't pause sending.

Until all three are set, email is shown as unavailable and Discord and webhook destinations keep working. The generic webhook contract and signature verification are documented in [`docs/notifications/webhooks.md`](docs/notifications/webhooks.md). `bun run email:dev` previews the email templates against fictional fixtures, with mobile and desktop widths and the plain-text version.

## Tests

`bun run test` runs the unit tests. There are no database-backed tests yet, so notification event claiming and row locking, persistence across job reruns, and concurrent job runs have no automated coverage. That stays open until the project has a managed test database with migrations applied in CI.

## Deployment

The SubTrack Railway project has separate `development` and `production` environments. [`.railway/railway.ts`](.railway/railway.ts) manages Postgres in both environments and the web app, scheduled jobs, and domain in production. Both production app services deploy from the `main` Git branch. The web app is served at **https://everysub.app**. Development keeps only Postgres with persistent storage and a public connection; run the web app and jobs locally. The production web app applies existing Drizzle migrations before deployment and checks database connectivity at `/api/health`.

See [the Railway deployment guide](.railway/README.md) for configuration changes, secrets, domain setup, and verification.

## Project map

- [`src/features`](src/features) contains the subscription, collection, invoice, dashboard, auth, import, and notification features.
- [`src/routes`](src/routes) contains public, account, and collection-scoped app routes and API endpoints.
- [`src/jobs`](src/jobs) holds the scheduled job that records invoices and sends notifications.
- [`src/lib/db`](src/lib/db) holds the Drizzle schema and database client; [`drizzle`](drizzle) holds migrations.
- [`docs/requirements`](docs/requirements) captures detailed behavior for invoices, imports, and notifications.
- [`docs/notifications`](docs/notifications) documents the webhook contract for notification receivers.
- [`fixtures/synthetic-statement.pdf`](fixtures/synthetic-statement.pdf) is fictional data for smart import demos and testing.

## Current limits

The app supports USD only; multi-currency support remains open. Email notifications go only to the account's verified address, and there's no in-app notification inbox.

Smart import is available only when `OPENAI_API_KEY` is configured. Uploaded files are sent to OpenAI for extraction and are not stored by EverySub. Import suggestions require review before saving.
