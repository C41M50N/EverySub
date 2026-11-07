import { eq, sql } from 'drizzle-orm';
import { expect, it } from 'vitest';

import { getMyOnboarding, markMyReminderInvitationShown, setUpMyAccount } from '@/features/onboarding/server';
import type { ImportSubscriptionItem } from '@/features/subscriptions/schema';
import { createMySubscription, importMySubscriptions } from '@/features/subscriptions/server';
import { db } from '@/lib/db';
import { categoryTable } from '@/lib/db/category-schema';
import { collectionTable } from '@/lib/db/collection-schema';
import { notificationSettingsTable } from '@/lib/db/notification-schema';
import { subscriptionTable } from '@/lib/db/subscription-schema';
import { seedAccount, seedUser } from '@/test/db';

const item: ImportSubscriptionItem = {
  name: 'Netflix',
  iconRef: 'netflix.com',
  category: null,
  costAmount: 1599,
  costFrequency: 'monthly',
  nextInvoiceDate: '2026-12-01',
  status: 'active',
  deactivatedAt: null,
};

/** Opens spare pool connections so the next concurrent calls overlap instead of queueing on a new connection. */
async function openSpareConnections() {
  await Promise.all([1, 2, 3].map(() => db.execute(sql`select pg_sleep(0.01)`)));
}

it('sets an account up once, however often or concurrently it is asked', async () => {
  const { id: userId } = await seedUser();
  // An account seen before (its onboarding row exists) that has no collection
  // yet. On a brand-new account the onboarding insert alone serializes setup;
  // here only setup's row lock keeps two visits from both creating Personal.
  await getMyOnboarding(userId);

  await openSpareConnections();
  const [first, second] = await Promise.all([
    setUpMyAccount({ userId, timeZone: 'America/New_York' }),
    setUpMyAccount({ userId, timeZone: 'America/New_York' }),
  ]);

  expect(second).toEqual(first);
  const collections = await db.select().from(collectionTable).where(eq(collectionTable.userId, userId));
  expect(collections).toMatchObject([{ id: first.collectionId, name: 'Personal' }]);

  // A later visit from another browser keeps the user's categories and time zone as they are.
  await db.delete(categoryTable).where(eq(categoryTable.name, 'Health'));
  await expect(setUpMyAccount({ userId, timeZone: 'Europe/London' })).resolves.toEqual(first);

  const categories = await db.select().from(categoryTable).where(eq(categoryTable.collectionId, first.collectionId));
  expect(categories).toHaveLength(6);
  expect(await db.select().from(notificationSettingsTable)).toMatchObject([{ userId, timeZone: 'America/New_York' }]);
});

it('leaves an account that already tracks subscriptions out of onboarding and the reminder invitation', async () => {
  const { id: userId } = await seedUser();
  // Subscriptions saved before onboarding existed, with no onboarding row.
  const [household] = await db.insert(collectionTable).values({ userId, name: 'Household' }).returning();
  await db.insert(subscriptionTable).values({
    userId,
    collectionId: household.id,
    name: 'Netflix',
    iconRef: 'netflix.com',
    costAmount: 1599,
    costFrequency: 'monthly',
    nextInvoiceDate: '2026-12-01',
  });

  await expect(setUpMyAccount({ userId, timeZone: 'America/New_York' })).resolves.toEqual({
    collectionId: household.id,
  });
  expect(await db.select().from(collectionTable).where(eq(collectionTable.userId, userId))).toHaveLength(1);

  await createMySubscription({ ...item, userId, collectionId: household.id, name: 'Hulu' });
  await expect(getMyOnboarding(userId)).resolves.toEqual({ completed: true, reminderInvitation: null });
});

it('completes onboarding on the first saved import, invites once, and ignores a failed save', async () => {
  const alice = await seedAccount();
  const { userId, collectionId } = alice;

  // A negative cost fails the insert after onboarding was recorded in the same
  // transaction, standing in for any save that fails partway.
  await expect(importMySubscriptions({ userId, collectionId, items: [{ ...item, costAmount: -1 }] })).rejects.toThrow();
  await expect(getMyOnboarding(userId)).resolves.toEqual({ completed: false, reminderInvitation: null });

  await importMySubscriptions({ userId, collectionId, items: [item, { ...item, name: 'Hulu' }] });
  await expect(getMyOnboarding(userId)).resolves.toEqual({
    completed: true,
    reminderInvitation: { collection: { id: collectionId, name: 'Personal' } },
  });

  await markMyReminderInvitationShown(userId);
  await createMySubscription({ ...item, userId, collectionId, name: 'Max' });
  await expect(getMyOnboarding(userId)).resolves.toEqual({ completed: true, reminderInvitation: null });
});
