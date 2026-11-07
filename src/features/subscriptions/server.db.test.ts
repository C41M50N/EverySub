import { and, asc, eq } from 'drizzle-orm';
import { expect, it } from 'vitest';

import { createMyCategory } from '@/features/categories/server';
import { createMyCollection } from '@/features/collections/server';
import { createSubscriptionInvoice } from '@/features/invoices/server';
import {
  categorizeMySubscriptions,
  createMySubscription,
  deactivateMySubscriptions,
  deleteMySubscriptions,
  getMySubscription,
  importMySubscriptions,
  listMySubscriptions,
  moveMySubscriptions,
  reactivateMySubscriptions,
  undoMyDeactivation,
  updateMySubscription,
} from '@/features/subscriptions/server';
import { db } from '@/lib/db';
import { categoryTable } from '@/lib/db/category-schema';
import { subscriptionInvoiceTable } from '@/lib/db/invoice-schema';
import { subscriptionTable } from '@/lib/db/subscription-schema';
import { seedAccount } from '@/test/db';

const SUBSCRIPTIONS_CHANGED = 'Subscriptions changed. Refresh and try again.';

function addSubscription(input: {
  userId: string;
  collectionId: string;
  name: string;
  categoryId?: string | null;
  nextInvoiceDate?: string;
}) {
  return createMySubscription({
    iconRef: `${input.name.toLowerCase()}.com`,
    costAmount: 1599,
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

  if (!category) {
    throw new Error(`No category "${name}" in collection ${collectionId}`);
  }

  return category.id;
}

async function deactivateAt(subscriptionId: string, deactivatedAt: Date) {
  await db
    .update(subscriptionTable)
    .set({ status: 'inactive', deactivatedAt })
    .where(eq(subscriptionTable.id, subscriptionId));
}

function allSubscriptions() {
  return db.select().from(subscriptionTable).orderBy(asc(subscriptionTable.id));
}

it("keeps another user's subscriptions out of reads and edits", async () => {
  const alice = await seedAccount();
  const bob = await seedAccount();
  const netflix = await addSubscription({ ...alice, name: 'Netflix' });
  await addSubscription({ ...bob, name: 'Hulu' });

  expect(await getMySubscription(bob.userId, netflix.id)).toBeNull();
  expect(await listMySubscriptions(bob.userId, { collectionId: alice.collectionId })).toEqual([]);
  expect((await listMySubscriptions(bob.userId)).map((subscription) => subscription.name)).toEqual(['Hulu']);

  await expect(
    updateMySubscription({
      userId: bob.userId,
      subscriptionId: netflix.id,
      name: 'Hijacked',
      notificationsIncluded: false,
    }),
  ).rejects.toThrow('Subscription not found');

  const [after] = await db.select().from(subscriptionTable).where(eq(subscriptionTable.id, netflix.id));
  expect(after).toMatchObject({ name: 'Netflix', notificationsIncluded: true });
});

it("rejects a bulk action that includes another user's subscription and changes nothing", async () => {
  const alice = await seedAccount();
  const bob = await seedAccount();
  const work = await createMyCollection({ userId: alice.userId, name: 'Work' });
  const deactivatedAt = new Date('2026-10-01T15:00:00.000Z');

  const aliceActive = await addSubscription({ ...alice, name: 'Netflix' });
  const aliceInactive = await addSubscription({ ...alice, name: 'Hulu' });
  const bobActive = await addSubscription({ ...bob, name: 'Spotify' });
  const bobInactive = await addSubscription({ ...bob, name: 'Max' });
  await deactivateAt(aliceInactive.id, deactivatedAt);
  await deactivateAt(bobInactive.id, deactivatedAt);

  const before = await allSubscriptions();
  const active = [aliceActive.id, bobActive.id];
  const inactive = [aliceInactive.id, bobInactive.id];
  const { userId } = alice;

  await expect(deactivateMySubscriptions({ userId, subscriptionIds: active })).rejects.toThrow(SUBSCRIPTIONS_CHANGED);
  await expect(reactivateMySubscriptions({ userId, subscriptionIds: inactive })).rejects.toThrow(SUBSCRIPTIONS_CHANGED);
  await expect(undoMyDeactivation({ userId, subscriptionIds: inactive, deactivatedAt })).rejects.toThrow(
    SUBSCRIPTIONS_CHANGED,
  );
  await expect(deleteMySubscriptions({ userId, subscriptionIds: active })).rejects.toThrow(SUBSCRIPTIONS_CHANGED);
  await expect(
    categorizeMySubscriptions({
      userId,
      subscriptionIds: active,
      categoryId: await categoryId(alice.collectionId, 'Productivity'),
    }),
  ).rejects.toThrow(SUBSCRIPTIONS_CHANGED);
  await expect(moveMySubscriptions({ userId, subscriptionIds: active, collectionId: work.id })).rejects.toThrow(
    SUBSCRIPTIONS_CHANGED,
  );

  // Neither Bob's rows nor Alice's own half of each request moved.
  expect(await allSubscriptions()).toEqual(before);
});

it('refuses to place a subscription in a collection or category the subscription cannot belong to', async () => {
  const alice = await seedAccount();
  const bob = await seedAccount();
  const work = await createMyCollection({ userId: alice.userId, name: 'Work' });
  const workEntertainment = await categoryId(work.id, 'Entertainment');
  const netflix = await addSubscription({
    ...alice,
    name: 'Netflix',
    categoryId: await categoryId(alice.collectionId, 'Entertainment'),
  });
  const before = await allSubscriptions();
  const { userId } = alice;

  await expect(addSubscription({ userId, collectionId: bob.collectionId, name: 'Hulu' })).rejects.toThrow(
    'Collection not found',
  );
  // Categories belong to one collection, and the subscription's category_id
  // foreign key doesn't check which, so the server is the only guard.
  await expect(
    addSubscription({ userId, collectionId: alice.collectionId, name: 'Hulu', categoryId: workEntertainment }),
  ).rejects.toThrow('Category not found');
  await expect(
    updateMySubscription({ userId, subscriptionId: netflix.id, categoryId: workEntertainment }),
  ).rejects.toThrow('Category not found');
  await expect(
    categorizeMySubscriptions({
      userId,
      subscriptionIds: [netflix.id],
      categoryId: await categoryId(bob.collectionId, 'Entertainment'),
    }),
  ).rejects.toThrow('Category not found');
  await expect(
    moveMySubscriptions({ userId, subscriptionIds: [netflix.id], collectionId: bob.collectionId }),
  ).rejects.toThrow('Collection not found');
  await expect(
    importMySubscriptions({
      userId,
      collectionId: bob.collectionId,
      items: [
        {
          name: 'Hulu',
          iconRef: 'hulu.com',
          category: 'Streaming',
          costAmount: 999,
          costFrequency: 'monthly',
          nextInvoiceDate: '2026-12-01',
          status: 'active',
          deactivatedAt: null,
        },
      ],
    }),
  ).rejects.toThrow('Collection not found');

  expect(await allSubscriptions()).toEqual(before);
  expect(await db.select().from(categoryTable).where(eq(categoryTable.collectionId, bob.collectionId))).toHaveLength(7);
});

it('moves subscriptions with their categories by name and leaves recorded invoices behind', async () => {
  const alice = await seedAccount();
  const { userId } = alice;
  const work = await createMyCollection({ userId, name: 'Work' });
  const personalStreaming = await createMyCategory({ userId, collectionId: alice.collectionId, name: 'Streaming' });
  const personalGaming = await createMyCategory({ userId, collectionId: alice.collectionId, name: 'Gaming' });
  const workStreaming = await createMyCategory({ userId, collectionId: work.id, name: 'streaming' });

  const netflix = await addSubscription({ ...alice, name: 'Netflix', categoryId: personalStreaming.id });
  const steam = await addSubscription({ ...alice, name: 'Steam', categoryId: personalGaming.id });
  const xbox = await addSubscription({ ...alice, name: 'Xbox', categoryId: personalGaming.id });
  const gym = await addSubscription({ ...alice, name: 'Gym', nextInvoiceDate: '2027-01-15' });
  const deactivatedAt = new Date('2026-09-30T12:00:00.000Z');
  await deactivateAt(gym.id, deactivatedAt);
  const invoice = await createSubscriptionInvoice({ userId, subscriptionId: netflix.id });

  await moveMySubscriptions({
    userId,
    subscriptionIds: [netflix.id, steam.id, xbox.id, gym.id],
    collectionId: work.id,
  });

  const workCategories = await db
    .select({ id: categoryTable.id, name: categoryTable.name })
    .from(categoryTable)
    .where(eq(categoryTable.collectionId, work.id));
  const workGaming = workCategories.filter((category) => category.name.toLowerCase() === 'gaming');

  // "Gaming" was created once, in its source casing; "Streaming" reused the existing "streaming".
  expect(workGaming).toEqual([{ id: expect.any(String), name: 'Gaming' }]);
  expect(workCategories.filter((category) => category.name.toLowerCase() === 'streaming')).toEqual([
    { id: workStreaming.id, name: 'streaming' },
  ]);

  const moved = await db.select().from(subscriptionTable).orderBy(asc(subscriptionTable.name));
  expect(moved).toMatchObject([
    {
      name: 'Gym',
      collectionId: work.id,
      categoryId: null,
      status: 'inactive',
      deactivatedAt,
      nextInvoiceDate: '2027-01-15',
    },
    { name: 'Netflix', collectionId: work.id, categoryId: workStreaming.id, status: 'active' },
    { name: 'Steam', collectionId: work.id, categoryId: workGaming[0].id },
    { name: 'Xbox', collectionId: work.id, categoryId: workGaming[0].id },
  ]);

  // Recorded history stays in the collection it was recorded in.
  const [invoiceAfter] = await db
    .select()
    .from(subscriptionInvoiceTable)
    .where(eq(subscriptionInvoiceTable.id, invoice.id));
  expect(invoiceAfter).toMatchObject({ collectionId: alice.collectionId, category: 'Streaming' });
});

it('imports into existing categories by name, keeps deactivation times, and saves nothing when an item fails', async () => {
  const alice = await seedAccount();
  const { userId, collectionId } = alice;
  const item = {
    iconRef: 'example.com',
    costAmount: 1299,
    costFrequency: 'monthly',
    nextInvoiceDate: '2026-12-01',
    status: 'active',
    deactivatedAt: null,
  } as const;

  await expect(
    importMySubscriptions({
      userId,
      collectionId,
      items: [
        { ...item, name: 'Netflix', category: 'entertainment' },
        { ...item, name: 'Hulu', category: 'Streaming', status: 'inactive', deactivatedAt: '2026-03-01T12:00:00Z' },
        { ...item, name: 'Notes', category: null },
      ],
    }),
  ).resolves.toEqual({ subscriptionsImported: 3, categoriesCreated: 1 });

  expect(await db.select().from(subscriptionTable).orderBy(asc(subscriptionTable.name))).toMatchObject([
    {
      name: 'Hulu',
      categoryId: await categoryId(collectionId, 'Streaming'),
      status: 'inactive',
      deactivatedAt: new Date('2026-03-01T12:00:00Z'),
    },
    { name: 'Netflix', categoryId: await categoryId(collectionId, 'Entertainment'), status: 'active' },
    { name: 'Notes', categoryId: null },
  ]);

  // The second item fails after the first item's new category was resolved.
  await expect(
    importMySubscriptions({
      userId,
      collectionId,
      items: [
        { ...item, name: 'Steam', category: 'Gaming' },
        { ...item, name: 'Xbox', category: 'Gaming', status: 'inactive', deactivatedAt: '2099-01-01T00:00:00Z' },
      ],
    }),
  ).rejects.toThrow('Deactivation time can’t be in the future');

  expect(await db.select().from(subscriptionTable)).toHaveLength(3);
  await expect(categoryId(collectionId, 'Gaming')).rejects.toThrow('No category "Gaming"');
});
