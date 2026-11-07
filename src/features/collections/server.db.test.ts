import { and, asc, eq, sql } from 'drizzle-orm';
import { expect, it } from 'vitest';

import { createMyCategory } from '@/features/categories/server';
import { LAST_COLLECTION_DELETE_MESSAGE } from '@/features/collections/schema';
import {
  createMyCollection,
  deleteMyCollection,
  duplicateMyCollection,
  renameMyCollection,
} from '@/features/collections/server';
import { createSubscriptionInvoice } from '@/features/invoices/server';
import { createMySubscription } from '@/features/subscriptions/server';
import { db } from '@/lib/db';
import { categoryTable } from '@/lib/db/category-schema';
import { collectionTable } from '@/lib/db/collection-schema';
import { subscriptionInvoiceTable } from '@/lib/db/invoice-schema';
import { notificationDestinationTable, notificationRouteTable } from '@/lib/db/notification-schema';
import { onboardingTable } from '@/lib/db/onboarding-schema';
import { subscriptionTable } from '@/lib/db/subscription-schema';
import { UserFacingError } from '@/lib/errors';
import { seedAccount } from '@/test/db';

const DUPLICATE_NAME_MESSAGE = 'A collection with this name already exists';

function addSubscription(input: {
  userId: string;
  collectionId: string;
  name: string;
  categoryId?: string | null;
  notificationsIncluded?: boolean;
}) {
  return createMySubscription({
    iconRef: `${input.name.toLowerCase()}.com`,
    costAmount: 999,
    costFrequency: 'monthly',
    nextInvoiceDate: '2026-12-01',
    ...input,
  });
}

async function categoryId(collectionId: string, name: string) {
  const [category] = await db
    .select({ id: categoryTable.id })
    .from(categoryTable)
    .where(and(eq(categoryTable.collectionId, collectionId), eq(categoryTable.name, name)));

  return category.id;
}

function collectionNames(userId: string) {
  return db
    .select({ name: collectionTable.name })
    .from(collectionTable)
    .where(eq(collectionTable.userId, userId))
    .orderBy(asc(collectionTable.name))
    .then((rows) => rows.map((row) => row.name));
}

function categoryNames(collectionId: string) {
  return db
    .select({ name: categoryTable.name })
    .from(categoryTable)
    .where(eq(categoryTable.collectionId, collectionId))
    .orderBy(asc(categoryTable.name))
    .then((rows) => rows.map((row) => row.name));
}

/** Resolves to the error a promise rejects with, so its class can be checked along with its message. */
function rejectionOf(promise: Promise<unknown>) {
  return promise.then(
    () => {
      throw new Error('Expected the promise to reject');
    },
    (error: unknown) => error,
  );
}

it('deletes a collection with everything in it and nothing outside it', async () => {
  const alice = await seedAccount();
  const bob = await seedAccount();
  const { userId } = alice;
  const work = await createMyCollection({ userId, name: 'Work' });

  // The account's first save goes into Work, so onboarding points at it.
  const slack = await addSubscription({ userId, collectionId: work.id, name: 'Slack' });
  await addSubscription({ ...alice, name: 'Netflix' });
  await addSubscription({ ...bob, name: 'Hulu' });
  await createSubscriptionInvoice({ userId, subscriptionId: slack.id });

  const [discord] = await db
    .insert(notificationDestinationTable)
    .values({ userId, type: 'discord', name: 'Alerts', webhookUrl: 'https://discord.com/api/webhooks/1/token' })
    .returning();
  await db.insert(notificationRouteTable).values([
    { userId, collectionId: work.id, destinationId: discord.id, kind: 'renewal_reminder' },
    { userId, collectionId: alice.collectionId, destinationId: discord.id, kind: 'monthly_overview' },
  ]);

  await expect(deleteMyCollection({ userId: bob.userId, collectionId: work.id })).rejects.toThrow(
    'Collection not found',
  );
  expect(await collectionNames(userId)).toEqual(['Personal', 'Work']);

  await deleteMyCollection({ userId, collectionId: work.id });

  expect(await collectionNames(userId)).toEqual(['Personal']);
  expect(await collectionNames(bob.userId)).toEqual(['Personal']);
  expect(
    (await db.select().from(subscriptionTable).orderBy(asc(subscriptionTable.name))).map((row) => row.name),
  ).toEqual(['Hulu', 'Netflix']);
  expect(await categoryNames(work.id)).toEqual([]);
  expect(await categoryNames(alice.collectionId)).toHaveLength(7);
  expect(await db.select().from(subscriptionInvoiceTable)).toEqual([]);

  // The destination is account-wide and keeps its route for the other collection.
  expect(await db.select().from(notificationDestinationTable)).toHaveLength(1);
  expect(await db.select().from(notificationRouteTable)).toMatchObject([
    { collectionId: alice.collectionId, kind: 'monthly_overview' },
  ]);

  // Onboarding stays complete; its invitation just loses the collection.
  const [onboarding] = await db.select().from(onboardingTable).where(eq(onboardingTable.userId, userId));
  expect(onboarding).toMatchObject({ collectionId: null, reminderInvitation: 'pending' });
  expect(onboarding.firstSubscriptionSavedAt).toBeInstanceOf(Date);
});

it('never deletes an account’s last collection, even when two deletes race', async () => {
  const alice = await seedAccount();
  const { userId } = alice;

  const onlyCollection = await rejectionOf(deleteMyCollection({ userId, collectionId: alice.collectionId }));
  expect(onlyCollection).toBeInstanceOf(UserFacingError);
  expect(onlyCollection).toHaveProperty('message', LAST_COLLECTION_DELETE_MESSAGE);

  const work = await createMyCollection({ userId, name: 'Work' });
  // Open spare pool connections first, so both deletes really overlap rather
  // than the second waiting on a new connection until the first has finished.
  await Promise.all([1, 2, 3].map(() => db.execute(sql`select pg_sleep(0.01)`)));
  const results = await Promise.allSettled([
    deleteMyCollection({ userId, collectionId: alice.collectionId }),
    deleteMyCollection({ userId, collectionId: work.id }),
  ]);

  expect(results.map((result) => result.status).sort()).toEqual(['fulfilled', 'rejected']);
  expect(results.find((result) => result.status === 'rejected')).toMatchObject({
    reason: { message: LAST_COLLECTION_DELETE_MESSAGE },
  });
  expect(await db.select().from(collectionTable).where(eq(collectionTable.userId, userId))).toHaveLength(1);
});

it('keeps collection names unique per account, ignoring case', async () => {
  const alice = await seedAccount();
  const bob = await seedAccount();
  const work = await createMyCollection({ userId: alice.userId, name: 'Work' });

  // Another account's names don't count.
  await createMyCollection({ userId: bob.userId, name: 'work' });

  await expect(createMyCollection({ userId: alice.userId, name: 'personal' })).rejects.toThrow();
  await expect(renameMyCollection({ userId: alice.userId, collectionId: work.id, name: 'PERSONAL' })).rejects.toThrow();
  await expect(renameMyCollection({ userId: bob.userId, collectionId: work.id, name: 'Mine' })).rejects.toThrow(
    'Collection not found',
  );

  expect(await collectionNames(alice.userId)).toEqual(['Personal', 'Work']);
  expect(await collectionNames(bob.userId)).toEqual(['Personal', 'work']);
});

it('tells the user when a collection name is already taken', async () => {
  const alice = await seedAccount();
  const work = await createMyCollection({ userId: alice.userId, name: 'Work' });

  const created = await rejectionOf(createMyCollection({ userId: alice.userId, name: 'personal' }));
  const renamed = await rejectionOf(
    renameMyCollection({ userId: alice.userId, collectionId: work.id, name: 'PERSONAL' }),
  );

  for (const error of [created, renamed]) {
    expect(error).toBeInstanceOf(UserFacingError);
    expect(error).toHaveProperty('message', DUPLICATE_NAME_MESSAGE);
  }
});

it('duplicates a collection’s own categories and subscriptions into a new copy', async () => {
  const alice = await seedAccount();
  const bob = await seedAccount();
  const { userId, collectionId } = alice;
  const gaming = await createMyCategory({ userId, collectionId, name: 'Gaming' });
  // The copy takes the source's categories, not the starter set.
  await db.delete(categoryTable).where(eq(categoryTable.id, await categoryId(collectionId, 'Health')));

  await addSubscription({ ...alice, name: 'Steam', categoryId: gaming.id });
  await addSubscription({ ...alice, name: 'Xbox', categoryId: gaming.id, notificationsIncluded: false });
  await addSubscription({ ...alice, name: 'Notes', categoryId: null });
  await addSubscription({ ...bob, name: 'Hulu', categoryId: await categoryId(bob.collectionId, 'Entertainment') });
  const originalRows = await db
    .select()
    .from(subscriptionTable)
    .where(eq(subscriptionTable.collectionId, collectionId));

  await expect(duplicateMyCollection({ userId: bob.userId, collectionId })).rejects.toThrow('Collection not found');
  expect(await collectionNames(bob.userId)).toEqual(['Personal']);

  const copy = await duplicateMyCollection({ userId, collectionId });

  expect(copy.name).toBe('Personal (copy)');
  expect(await categoryNames(copy.id)).toEqual([
    'Education',
    'Entertainment',
    'Finance',
    'Gaming',
    'Miscellaneous',
    'Productivity',
    'Utilities',
  ]);
  const copyGaming = await categoryId(copy.id, 'Gaming');
  expect(
    await db
      .select()
      .from(subscriptionTable)
      .where(eq(subscriptionTable.collectionId, copy.id))
      .orderBy(asc(subscriptionTable.name)),
  ).toMatchObject([
    { name: 'Notes', userId, categoryId: null },
    { name: 'Steam', userId, categoryId: copyGaming, notificationsIncluded: true },
    { name: 'Xbox', userId, categoryId: copyGaming, notificationsIncluded: false },
  ]);
  expect(await db.select().from(subscriptionTable).where(eq(subscriptionTable.collectionId, collectionId))).toEqual(
    originalRows,
  );

  // A second copy can't take the first copy's name.
  expect((await duplicateMyCollection({ userId, collectionId })).name).toBe('Personal (copy 2)');
});

it('duplicates an inactive subscription with the time it was deactivated', async () => {
  const alice = await seedAccount();
  const deactivatedAt = new Date('2026-09-30T12:00:00.000Z');
  const gym = await addSubscription({ ...alice, name: 'Gym' });
  await db.update(subscriptionTable).set({ status: 'inactive', deactivatedAt }).where(eq(subscriptionTable.id, gym.id));

  const copy = await duplicateMyCollection({ userId: alice.userId, collectionId: alice.collectionId });

  const [copied] = await db.select().from(subscriptionTable).where(eq(subscriptionTable.collectionId, copy.id));
  expect(copied).toMatchObject({ status: 'inactive', deactivatedAt });
});
