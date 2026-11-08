import { createHmac, randomBytes } from 'node:crypto';

import { test as base, type BrowserContext } from '@playwright/test';
import { addDays, format } from 'date-fns';
import { ENV } from 'varlock/env';

import { createMySubscription } from '@/features/subscriptions/server';
import { generateId } from '@/lib/data-utils';
import { db } from '@/lib/db';
import { session as sessionTable } from '@/lib/db/auth-schema';
import { seedAccount, seedUser } from '@/test/db';

export { expect } from '@playwright/test';

/**
 * Better Auth's session cookie, named as the app's auth instance names it. It
 * has no `__Secure-` prefix because BETTER_AUTH_URL in .env.test is plain
 * http. The value is the session token signed the way better-call signs
 * cookies: HMAC-SHA256 with the auth secret, base64, appended after a dot.
 */
const SESSION_COOKIE_NAME = 'better-auth.session_token';
const SESSION_DAYS = 7;

/** Signs the browser in as `userId` by inserting a session row and setting its cookie. */
async function signIn(context: BrowserContext, baseURL: string | undefined, userId: string) {
  if (!baseURL) {
    throw new Error('Browser tests need `use.baseURL` in playwright.config.ts.');
  }

  const token = randomBytes(32).toString('base64url');
  const now = new Date();

  await db.insert(sessionTable).values({
    id: generateId(),
    token,
    userId,
    expiresAt: addDays(now, SESSION_DAYS),
    updatedAt: now,
  });

  const signature = createHmac('sha256', ENV.BETTER_AUTH_SECRET).update(token).digest('base64');

  await context.addCookies([
    {
      name: SESSION_COOKIE_NAME,
      value: encodeURIComponent(`${token}.${signature}`),
      url: baseURL,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
}

type TrackedSubscription = {
  name: string;
  /** Monthly, in cents. */
  costAmount: number;
};

type Fixtures = {
  /** Signs in as someone who has signed up with Google and never opened the app. */
  signInAsNewUser: () => Promise<void>;
  /**
   * Signs in as an account that has opened the app before, so it owns a
   * Personal collection. Subscriptions passed in are already tracked there,
   * which also completes onboarding, as a real first save does.
   */
  signInAsAccount: (options?: { tracking?: TrackedSubscription[] }) => Promise<{ collectionId: string }>;
};

type WorkerFixtures = {
  database: void;
};

export const test = base.extend<Fixtures, WorkerFixtures>({
  // The seed helpers share one connection pool per worker. Closing it lets the
  // worker exit as soon as its tests are done.
  database: [
    // Playwright reads fixture dependencies from this destructuring pattern.
    // oxlint-disable-next-line no-empty-pattern
    async ({}, use) => {
      await use();
      await db.$client.end();
    },
    { scope: 'worker', auto: true },
  ],

  signInAsNewUser: async ({ context, baseURL }, use) => {
    await use(async () => {
      const user = await seedUser();
      await signIn(context, baseURL, user.id);
    });
  },

  signInAsAccount: async ({ context, baseURL }, use) => {
    await use(async ({ tracking = [] } = {}) => {
      const { userId, collectionId } = await seedAccount();

      for (const subscription of tracking) {
        await createMySubscription({
          userId,
          collectionId,
          name: subscription.name,
          iconRef: '',
          costAmount: subscription.costAmount,
          costFrequency: 'monthly',
          nextInvoiceDate: format(new Date(), 'yyyy-MM-dd'),
        });
      }

      await signIn(context, baseURL, userId);

      return { collectionId };
    });
  },
});
