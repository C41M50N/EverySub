import { asc, eq, sql } from 'drizzle-orm';
import { expect, it, vi } from 'vitest';

import { listMyCategories } from '@/features/categories/server';
import {
  createMySubscription,
  deactivateMySubscriptions,
  updateMySubscription,
  type SubscriptionCostFrequency,
} from '@/features/subscriptions/server';
import { recordDueInvoices } from '@/jobs/due-invoices';
import { db } from '@/lib/db';
import { subscriptionInvoiceTable } from '@/lib/db/invoice-schema';
import { subscriptionTable } from '@/lib/db/subscription-schema';
import { seedAccount } from '@/test/db';

async function addSubscription(
  account: { userId: string; collectionId: string },
  input: {
    name: string;
    costAmount: number;
    costFrequency: SubscriptionCostFrequency;
    nextInvoiceDate: string;
    categoryId?: string;
  },
) {
  return createMySubscription({ ...account, iconRef: 'example.com', ...input });
}

async function readInvoices() {
  return db
    .select({
      userId: subscriptionInvoiceTable.userId,
      subscriptionId: subscriptionInvoiceTable.subscriptionId,
      collectionId: subscriptionInvoiceTable.collectionId,
      name: subscriptionInvoiceTable.name,
      category: subscriptionInvoiceTable.category,
      amount: subscriptionInvoiceTable.amount,
      invoiceDate: subscriptionInvoiceTable.invoiceDate,
    })
    .from(subscriptionInvoiceTable)
    .orderBy(asc(subscriptionInvoiceTable.invoiceDate), asc(subscriptionInvoiceTable.name));
}

async function readNextInvoiceDate(subscriptionId: string) {
  const [row] = await db
    .select({ nextInvoiceDate: subscriptionTable.nextInvoiceDate })
    .from(subscriptionTable)
    .where(eq(subscriptionTable.id, subscriptionId));

  return row.nextInvoiceDate;
}

it('records every missed charge with a snapshot of the subscription, and advances its schedule', async () => {
  const account = await seedAccount();
  const categories = await listMyCategories(account.userId, account.collectionId);
  const entertainment = categories.find((category) => category.name === 'Entertainment');
  const video = await addSubscription(account, {
    name: 'Streamline Video',
    costAmount: 1599,
    costFrequency: 'monthly',
    nextInvoiceDate: '2026-01-15',
    categoryId: entertainment?.id,
  });
  const backup = await addSubscription(account, {
    name: 'Cloud Backup',
    costAmount: 9900,
    costFrequency: 'yearly',
    nextInvoiceDate: '2025-12-01',
  });
  const gym = await addSubscription(account, {
    name: 'Old Gym',
    costAmount: 4000,
    costFrequency: 'monthly',
    nextInvoiceDate: '2026-01-01',
  });
  await deactivateMySubscriptions({ userId: account.userId, subscriptionIds: [gym.id] });

  const now = new Date('2026-03-20T16:00:00Z');
  expect(await recordDueInvoices({ now })).toEqual({ subscriptionsProcessed: 2, invoicesCreated: 4 });

  const owner = { userId: account.userId, collectionId: account.collectionId };
  expect(await readInvoices()).toEqual([
    {
      ...owner,
      subscriptionId: backup.id,
      name: 'Cloud Backup',
      category: 'Uncategorized',
      amount: 9900,
      invoiceDate: '2025-12-01',
    },
    ...['2026-01-15', '2026-02-15', '2026-03-15'].map((invoiceDate) => ({
      ...owner,
      subscriptionId: video.id,
      name: 'Streamline Video',
      category: 'Entertainment',
      amount: 1599,
      invoiceDate,
    })),
  ]);

  expect(await readNextInvoiceDate(video.id)).toBe('2026-04-15');
  expect(await readNextInvoiceDate(backup.id)).toBe('2026-12-01');
  // An inactive subscription isn't charged, so its schedule stays put.
  expect(await readNextInvoiceDate(gym.id)).toBe('2026-01-01');
});

it('skips charges already recorded when a schedule is moved back, without blocking other users', async () => {
  const alice = await seedAccount();
  const bob = await seedAccount();
  const video = await addSubscription(alice, {
    name: 'Streamline Video',
    costAmount: 1599,
    costFrequency: 'monthly',
    nextInvoiceDate: '2026-02-15',
  });
  const now = new Date('2026-03-20T16:00:00Z');

  await recordDueInvoices({ now });

  // Alice moves her next charge back onto a date that was already recorded.
  await updateMySubscription({ userId: alice.userId, subscriptionId: video.id, nextInvoiceDate: '2026-02-15' });
  await addSubscription(bob, {
    name: 'Tunebox',
    costAmount: 999,
    costFrequency: 'monthly',
    nextInvoiceDate: '2026-03-01',
  });

  // The shared job runs in one transaction, so a duplicate for Alice must not
  // abort Bob's invoice.
  expect(await recordDueInvoices({ now })).toEqual({ subscriptionsProcessed: 2, invoicesCreated: 1 });

  const invoices = await readInvoices();
  expect(invoices.map((invoice) => [invoice.userId, invoice.invoiceDate])).toEqual([
    [alice.userId, '2026-02-15'],
    [bob.userId, '2026-03-01'],
    [alice.userId, '2026-03-15'],
  ]);
  expect(await readNextInvoiceDate(video.id)).toBe('2026-04-15');
});

it('records a charge once its date arrives in the owner’s time zone', async () => {
  // At 10:30 UTC on March 15 it is already March 16 in Kiritimati (UTC+14)
  // and still March 14 in Pago Pago (UTC−11).
  const kiritimati = await seedAccount({ timeZone: 'Pacific/Kiritimati' });
  const pagoPago = await seedAccount({ timeZone: 'Pacific/Pago_Pago' });
  // A browser zone that can't be recognized isn't saved, so this account falls back to UTC.
  const unsaved = await seedAccount({ timeZone: 'Not/A_Zone' });

  await addSubscription(kiritimati, {
    name: 'Island Radio',
    costAmount: 500,
    costFrequency: 'monthly',
    nextInvoiceDate: '2026-03-16',
  });
  const pagoPagoSubscription = await addSubscription(pagoPago, {
    name: 'Reef News',
    costAmount: 700,
    costFrequency: 'monthly',
    nextInvoiceDate: '2026-03-15',
  });
  await addSubscription(unsaved, {
    name: 'Plain Notes',
    costAmount: 300,
    costFrequency: 'monthly',
    nextInvoiceDate: '2026-03-15',
  });

  const now = new Date('2026-03-15T10:30:00Z');

  // Scoped to one user, as building a monthly overview does.
  expect(await recordDueInvoices({ now, userId: kiritimati.userId })).toEqual({
    subscriptionsProcessed: 1,
    invoicesCreated: 1,
  });
  expect((await readInvoices()).map((invoice) => [invoice.name, invoice.invoiceDate])).toEqual([
    ['Island Radio', '2026-03-16'],
  ]);

  expect(await recordDueInvoices({ now })).toEqual({ subscriptionsProcessed: 1, invoicesCreated: 1 });
  expect((await readInvoices()).map((invoice) => [invoice.name, invoice.invoiceDate])).toEqual([
    ['Plain Notes', '2026-03-15'],
    ['Island Radio', '2026-03-16'],
  ]);
  expect(await readNextInvoiceDate(pagoPagoSubscription.id)).toBe('2026-03-15');

  // Midnight in Pago Pago.
  expect(await recordDueInvoices({ now: new Date('2026-03-15T11:00:00Z') })).toEqual({
    subscriptionsProcessed: 1,
    invoicesCreated: 1,
  });
  expect(await readNextInvoiceDate(pagoPagoSubscription.id)).toBe('2026-04-15');
});

it('leaves a schedule the owner changes mid-run to the owner', async () => {
  const account = await seedAccount();
  const video = await addSubscription(account, {
    name: 'Streamline Video',
    costAmount: 1599,
    costFrequency: 'monthly',
    nextInvoiceDate: '2026-01-15',
  });

  // The owner starts saving a new date, holding the row lock the way
  // updateMySubscription does, before the job reaches the subscription.
  const { job } = await db.transaction(async (tx) => {
    await tx.select().from(subscriptionTable).where(eq(subscriptionTable.id, video.id)).for('update');

    const running = recordDueInvoices({ now: new Date('2026-03-20T16:00:00Z') });
    // Wait until the job is blocked on the owner's lock.
    await vi.waitFor(async () => {
      const { rows } = await db.execute<{ waiting: number }>(
        sql`select count(*)::int as waiting from pg_stat_activity
            where datname = current_database() and wait_event_type = 'Lock'`,
      );
      expect(rows[0].waiting).toBe(1);
    });

    await tx.update(subscriptionTable).set({ nextInvoiceDate: '2026-06-01' }).where(eq(subscriptionTable.id, video.id));

    // Wrapped, so the save commits without waiting for the job.
    return { job: running };
  });

  // The job saw the owner's saved date, which isn't due yet.
  expect(await job).toEqual({ subscriptionsProcessed: 0, invoicesCreated: 0 });
  expect(await readInvoices()).toEqual([]);
  expect(await readNextInvoiceDate(video.id)).toBe('2026-06-01');
});
