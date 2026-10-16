# Railway deployment

[railway.ts](railway.ts) is the infrastructure definition for the existing **SubTrack** project (`120b73a9-0f02-4926-9272-1c3699384c9f`). It supports `development` and `production` and rejects other projects or environments.

Production runs:

- `Postgres`: PostgreSQL 18 with persistent storage in US East. Production has its own database and data.
- `web`: TanStack Start, served on port 8080. Existing Drizzle migrations run with `bun run db:migrate` before each deployment. A failed migration stops deployment. `/api/health` checks Postgres and returns 200 or 503 without database details.
- `scheduled-jobs`: `bun run jobs:run` every five minutes, with no restart after exit. It records invoices and delivers due notifications, then closes the database pool.

Both production app services use `C41M50N/EverySub`, branch `main`, Railpack, Bun 1.4.2, and Node 24. Development dependencies stay in the image because pre-deploy migrations use `drizzle-kit`. The install hook sets Git hooks only in a Git checkout.

Development runs only `Postgres`, retaining its existing database, volume, and public connection. Run the web app with `bun run dev` and scheduled jobs with `bun run jobs:run` locally. Set local `DATABASE_URL` to development Postgres's `DATABASE_PUBLIC_URL`; the private Railway URL is not reachable locally. Apply committed migrations to the development database locally with `bun run db:migrate`.

## Apply infrastructure changes

Install dependencies with `bun install`. Use the authenticated Railway CLI, select the environment explicitly, and inspect the plan before applying:

```bash
railway link --project 120b73a9-0f02-4926-9272-1c3699384c9f --environment development
railway config plan
railway config apply --yes

railway link --project 120b73a9-0f02-4926-9272-1c3699384c9f --environment production
railway config plan
railway config apply --yes
```

IaC is applied by the CLI; Railway does not evaluate `.railway/railway.ts` when GitHub source deployments run. Apply infrastructure changes to both environments when editing this file. Git pushes to `main` deploy application code to production.

The definition manages the whole environment. Removing a resource can delete it. Keep the imported development volume declared, inspect destruction lines, and do not use `--confirm-destructive` for a routine deployment. Generated Railway domains and database provisioning details are retained by the platform.

The first development apply of the database-only definition intentionally removes `web` and `scheduled-jobs`. After confirming the plan deletes only those two services and preserves Postgres and its volume, use `railway config apply --yes --confirm-destructive` for that transition.

Do not run `db:generate` as part of deployment. Pre-deploy applies the migrations committed under `drizzle/`.

## Secrets and shared variables

Production credentials live in Railway shared variables; the IaC file contains only references. Configure the following in production before applying. Local app and job credentials belong in `.env.local`; the database-only development environment does not need app shared variables.

- `BETTER_AUTH_SECRET`: a random secret separate from the one used locally.
- Production's app services use the literal `https://everysub.app` for `BETTER_AUTH_URL` from IaC. Set local `BETTER_AUTH_URL` to `https://dev.everysub.com`.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
- `LOGO_DEV_SECRET_KEY`, `LOGO_DEV_PUBLISHABLE_KEY`, `OPENAI_API_KEY` (optional; empty disables the corresponding feature).
- `RESEND_API_KEY`, `RESEND_FROM_ADDRESS`, `RESEND_WEBHOOK_SECRET` (optional; email stays unavailable until all are configured).

Production `DATABASE_URL` references `Postgres.DATABASE_URL` over Railway private networking. Local development uses development Postgres's `DATABASE_PUBLIC_URL`. Never put secret values into the IaC file or commit `.env.local`. Adding a new shared variable also requires a reference on each production service that needs it.

## Hosts and Google sign-in

Production: `https://everysub.app`.

Local development: `https://dev.everysub.com`.

The Google OAuth client needs both origins and these exact authorized redirects:

```text
https://everysub.app/api/auth/callback/google
https://dev.everysub.com/api/auth/callback/google
```

Railway IaC retains an existing custom domain but cannot register a new one. For initial provisioning, create the web service without its `domains` field, register the domain with `railway domain everysub.app --service web --port 8080`, then restore the field. For `everysub.app`, Railway Domains manages DNS and automatically creates the ANAME routing and TXT ownership records. Manage these alongside the existing Resend records at `railway.com/workspace/domains/everysub.app`. For an externally registered domain, add the records returned by Railway at its DNS provider. Check `railway domain status everysub.app --service web --json` for DNS and certificate readiness.

## Resend delivery events

The sending domain is `mail.everysub.app`, with sender `EverySub <notifications@mail.everysub.app>`. Keep open and click tracking disabled. A sending-only API key can send emails but cannot create webhooks; use the Resend dashboard for setup.

Create the production webhook at `https://everysub.app/api/webhooks/resend`, subscribe to `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.complained`, `email.failed`, and `email.suppressed`, then save its signing secret as production's shared `RESEND_WEBHOOK_SECRET`. Redeploy both production app services so the web receiver and job runner pick it up.

Local development email remains unavailable while its signing secret is empty. Use a separate Resend workspace if enabling email locally: account-wide events should reach the app that owns the email, rather than retry against a different database.

## Verify a release

```bash
curl --fail https://everysub.app/api/health
railway deployment list --service web --environment production --json
railway logs --service scheduled-jobs --environment production --lines 50
railway config plan
```

Verify the submitted web deployment reached `SUCCESS`, migrations completed, the health endpoint returns `OK`, Google sign-in returns to the same host, and a scheduled job logs its summary and exits successfully. An upload or build alone does not establish a working release.
