# Testing

Tests exist to catch bugs a user would notice. Each one should answer, in a sentence, what would ship broken without it. If the honest answer is "a type error", "the mock was called", or "the component rendered", the test costs more than it returns and should not be written.

Two kinds of tests run today, told apart by filename. A third, browser tests, is planned and described at the end.

| Kind     | Files                     | Needs    | Runs with           | What it proves                                                                                      |
| -------- | ------------------------- | -------- | ------------------- | --------------------------------------------------------------------------------------------------- |
| Unit     | `*.test.ts`, `*.test.tsx` | Nothing  | `bun run test:unit` | Pure logic: dates, money, schedules, parsing, signing, rendered email text                          |
| Database | `*.db.test.ts`            | Postgres | `bun run test:db`   | Server functions and jobs against real tables: ownership, transactions, concurrency, the SQL itself |

`bun run test` runs both. CI runs both on every push.

## What goes where

**Unit tests** cover functions that take values and return values. Cost math, invoice schedules, time-zone arithmetic, import parsing, webhook signing, delivery policy, and email rendering all live here. They run in milliseconds and need no setup.

**Database tests** cover the `server.ts` modules under `src/features/*` and the jobs under `src/jobs`. These are the only tests that can see a missing `userId` filter, a transaction that half-completes, a `FOR UPDATE` that does not lock what it should, or a cascade that deletes too much or too little. They call the server functions directly with the real `db`, seed the rows a scenario needs, act, and read the database back. A good one reads like a user story:

```ts
it('refuses to move a subscription into a collection owned by someone else', async () => {
  const alice = await seedAccount();
  const bob = await seedAccount();
  const subscription = await createMySubscription({ userId: alice.userId, collectionId: alice.collectionId, ... });

  await expect(
    moveMySubscriptions({ userId: alice.userId, subscriptionIds: [subscription.id], collectionId: bob.collectionId }),
  ).rejects.toThrow();

  const [after] = await db.select().from(subscriptionTable).where(eq(subscriptionTable.id, subscription.id));
  expect(after.collectionId).toBe(alice.collectionId);
});
```

The app is a thin UI over these server functions, so this layer carries most of the "test it the way a user would experience it" value at a fraction of the cost of driving a browser.

## Rules

**Mock only at the edge of the system.** The Resend SDK, outbound HTTP, DNS, and the OpenAI client are external services and may be replaced in tests. Nothing the repository owns is mocked: no stubbed Drizzle, no faked server functions, no `vi.mock` of a sibling module. If a test seems to need one, the test is at the wrong layer. Move it down to a unit test of the pure part, or up to a database test of the real thing.

**Expected values are literals you reasoned out.** Never compute the expectation with the function under test or copy it from the implementation. A test that would still pass after reverting the line it covers is not a test.

**Drive time explicitly.** Functions that depend on the current time take a `now` or `clock` parameter. Pass one. No test depends on the wall clock.

**Prefer one scenario with several assertions over several one-line tests.** Seed, act, then inspect everything the action should and should not have changed. Table-driven cases are fine when each row exercises a different branch.

**Do not test the wrappers.** The `createServerFn` definitions in `api.ts` files are middleware plus a schema plus a call into `server.ts`. They mirror their inputs and need a request context to invoke. Test the `server.ts` function they call.

**Do not write component tests with mocked data.** Rendering a component with TanStack Query, Router, and the server functions stubbed out tests the stubs. When a component carries real logic, pull it into a pure module (as `features/imports/review.ts` is) and unit test that. The one legitimate jsdom test renders a real output artifact, the notification email, and inspects its text.

**Every test earns its place.** Before adding a test, name the bug it catches. Delete tests that stop earning theirs. The `tests-deslop` audit lists the patterns that do not: tautologies, type-redundant checks, code mirrors, mock-call mirrors, smoke tests, and duplicate table rows.

## Running database tests

Start Postgres once. The connection string in `.env.test` matches the Compose service.

```bash
docker compose up --detach --wait
bun run test:db
```

The data lives in memory and is gone when the container stops. Run `docker compose down` to stop it.

Each run applies the committed migrations in `drizzle/` to the test database, the same way production is migrated. Before every test, every table is truncated, so each test seeds exactly what it needs and nothing leaks between tests. Files in the `db` project run one at a time because the jobs under test process every user in the database.

Helpers in `src/test/db.ts`:

- `seedUser()` inserts a bare user, as Better Auth does after a first sign-in.
- `seedAccount()` inserts a user and runs the real first-visit setup, so they own a Personal collection with starter categories and a saved time zone. Most server functions need at least this.

Keep scenario-specific helpers in the test file that uses them. Promote a helper to `src/test/db.ts` only when a second file needs it.

## Browser tests

Not built yet. When they are, they use Playwright and cover only what the layers above cannot see: route loaders to queries to components to mutations to cache invalidation. Five journeys or fewer, such as first-run onboarding, adding a subscription and seeing it on the table and dashboard, the import review flow, and the unauthenticated redirect to `/login`. No visual assertions.

Google is the only sign-in provider, so the suite will sign in by inserting a user and session row through Better Auth's adapter and setting the signed session cookie on the browser context from Playwright's global setup. Production code gets no test-only path.

Browser tests run as a separate CI job on pull requests and `main`, so the lint, typecheck, and test job stays fast. Their cost is not minutes but flake and upkeep, which is why the suite stays small.
