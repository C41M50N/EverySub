import { setUpMyAccount } from '@/features/onboarding/server';
import { generateId } from '@/lib/data-utils';
import { db } from '@/lib/db';
import { user } from '@/lib/db/auth-schema';

/** Inserts a signed-up user with no collections, as Better Auth would after a first Google sign-in. */
export async function seedUser() {
  const id = generateId();
  const [row] = await db
    .insert(user)
    .values({ id, name: `User ${id.slice(0, 6)}`, email: `${id}@example.com`, emailVerified: true })
    .returning();

  return row;
}

/**
 * A user who has opened the app once: the real first-visit setup has run, so
 * they own a Personal collection with the starter categories and a saved time
 * zone. Most server functions need at least this much.
 */
export async function seedAccount(overrides: { timeZone?: string } = {}) {
  const account = await seedUser();
  const { collectionId } = await setUpMyAccount({
    userId: account.id,
    timeZone: overrides.timeZone ?? 'America/New_York',
  });

  return { user: account, userId: account.id, collectionId };
}
