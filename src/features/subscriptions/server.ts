import { and, asc, eq, getTableColumns, inArray, sql } from 'drizzle-orm';

import { toCategoryNameKey } from '@/features/categories/names';
import { assertCategoryInCollection, findOrCreateCategoriesByName } from '@/features/categories/server';
import { getCollectionFilter, getMyCollection } from '@/features/collections/server';
import { applyInclusion } from '@/features/notifications/inclusion';
import { getUserLocalDate } from '@/features/notifications/user-time-zone';
import { recordSubscriptionSave } from '@/features/onboarding/server';
import { getImportedDeactivatedAt } from '@/features/subscriptions/import';
import type { ImportSubscriptionItem } from '@/features/subscriptions/schema';
import { buildSeedSubscriptions } from '@/features/subscriptions/seed-data';
import { getNextInvoiceDateOnOrAfter } from '@/jobs/invoice-schedule';
import { db } from '@/lib/db';
import { categoryTable } from '@/lib/db/category-schema';
import { collectionTable } from '@/lib/db/collection-schema';
import { subscriptionTable } from '@/lib/db/subscription-schema';
import { UserFacingError } from '@/lib/errors';

export type Subscription = typeof subscriptionTable.$inferSelect;
export type SubscriptionStatus = Subscription['status'];
export type SubscriptionCostFrequency = Subscription['costFrequency'];
// A subscription row as returned by reads: table columns plus the resolved
// category name (null when Uncategorized).
export type SubscriptionListItem = Subscription & { category: string | null };

// Subscription rows are always read with the resolved category name joined in,
// so consumers get both the `categoryId` link and a display-ready `category`.
const subscriptionSelection = {
  ...getTableColumns(subscriptionTable),
  category: categoryTable.name,
};

export function getSubscriptionFilter(userId: string, subscriptionId: string) {
  return and(eq(subscriptionTable.userId, userId), eq(subscriptionTable.id, subscriptionId));
}

async function assertCollectionOwnership(userId: string, collectionId: string) {
  const collection = await getMyCollection(userId, collectionId);

  if (!collection) {
    throw new Error('Collection not found');
  }
}

export async function listMySubscriptions(
  userId: string,
  filters?: { collectionId?: string; status?: SubscriptionStatus },
) {
  const conditions = [eq(subscriptionTable.userId, userId)];

  if (filters?.collectionId) {
    conditions.push(eq(subscriptionTable.collectionId, filters.collectionId));
  }

  if (filters?.status) {
    conditions.push(eq(subscriptionTable.status, filters.status));
  }

  return db
    .select(subscriptionSelection)
    .from(subscriptionTable)
    .leftJoin(categoryTable, eq(subscriptionTable.categoryId, categoryTable.id))
    .where(and(...conditions))
    .orderBy(asc(subscriptionTable.nextInvoiceDate));
}

export async function getMySubscription(userId: string, subscriptionId: string) {
  const [subscription] = await db
    .select(subscriptionSelection)
    .from(subscriptionTable)
    .leftJoin(categoryTable, eq(subscriptionTable.categoryId, categoryTable.id))
    .where(getSubscriptionFilter(userId, subscriptionId))
    .limit(1);

  return subscription ?? null;
}

export async function createMySubscription(input: {
  userId: string;
  name: string;
  collectionId: string;
  iconRef: string;
  categoryId?: string | null;
  costAmount: number;
  costFrequency: SubscriptionCostFrequency;
  nextInvoiceDate: string;
  notificationsIncluded?: boolean;
}) {
  await assertCollectionOwnership(input.userId, input.collectionId);

  if (input.categoryId) {
    await assertCategoryInCollection(input.userId, input.collectionId, input.categoryId);
  }

  return db.transaction(async (tx) => {
    await recordSubscriptionSave(tx, { userId: input.userId, collectionId: input.collectionId });

    const [subscription] = await tx
      .insert(subscriptionTable)
      .values({
        userId: input.userId,
        name: input.name,
        collectionId: input.collectionId,
        iconRef: input.iconRef,
        categoryId: input.categoryId ?? null,
        costAmount: input.costAmount,
        costFrequency: input.costFrequency,
        nextInvoiceDate: input.nextInvoiceDate,
        notificationsIncluded: input.notificationsIncluded ?? true,
      })
      .returning();

    return subscription;
  });
}

// Moving is the only way to change a subscription's collection, so updates
// never accept a collectionId.
export async function updateMySubscription(input: {
  userId: string;
  subscriptionId: string;
  name?: string;
  iconRef?: string;
  categoryId?: string | null;
  costAmount?: number;
  costFrequency?: SubscriptionCostFrequency;
  nextInvoiceDate?: string;
  notificationsIncluded?: boolean;
}) {
  return db.transaction(async (tx) => {
    // Lock the row so a concurrent move can't change its collection between the
    // category check and the update.
    const [current] = await tx
      .select({
        collectionId: subscriptionTable.collectionId,
        costFrequency: subscriptionTable.costFrequency,
        nextInvoiceDate: subscriptionTable.nextInvoiceDate,
      })
      .from(subscriptionTable)
      .where(getSubscriptionFilter(input.userId, input.subscriptionId))
      .for('update');

    if (!current) {
      throw new Error('Subscription not found');
    }

    // A non-null category must belong to the subscription's collection.
    if (input.categoryId) {
      await assertCategoryInCollection(input.userId, current.collectionId, input.categoryId, tx);
    }

    if (input.notificationsIncluded !== undefined) {
      await applyInclusion(tx, {
        userId: input.userId,
        subscriptionIds: [input.subscriptionId],
        included: input.notificationsIncluded,
      });
    }

    // A new schedule only gets reminders whose send time is still ahead.
    const rescheduled =
      (input.nextInvoiceDate !== undefined && input.nextInvoiceDate !== current.nextInvoiceDate) ||
      (input.costFrequency !== undefined && input.costFrequency !== current.costFrequency);

    const [subscription] = await tx
      .update(subscriptionTable)
      .set({
        name: input.name,
        iconRef: input.iconRef,
        categoryId: input.categoryId,
        costAmount: input.costAmount,
        costFrequency: input.costFrequency,
        nextInvoiceDate: input.nextInvoiceDate,
        ...(rescheduled ? { remindersEligibleAt: new Date() } : {}),
      })
      .where(getSubscriptionFilter(input.userId, input.subscriptionId))
      .returning();

    return subscription;
  });
}

/**
 * Writes reviewed import items into one collection, all or nothing. Category
 * names are resolved in the collection, creating the ones that don't exist.
 */
export async function importMySubscriptions(input: {
  userId: string;
  collectionId: string;
  items: ImportSubscriptionItem[];
}) {
  return db.transaction(async (tx) => {
    const [collection] = await tx
      .select({ id: collectionTable.id })
      .from(collectionTable)
      .where(getCollectionFilter(input.userId, input.collectionId))
      .limit(1);

    if (!collection) {
      throw new Error('Collection not found');
    }

    const importedAt = new Date();
    const { categoryIdByKey, createdCount } = await findOrCreateCategoriesByName(tx, {
      userId: input.userId,
      collectionId: input.collectionId,
      names: input.items.flatMap((item) => item.category ?? []),
    });

    const values = input.items.map((item) => {
      const categoryId = item.category === null ? null : categoryIdByKey.get(toCategoryNameKey(item.category));

      if (categoryId === undefined) {
        throw new Error('Failed to resolve category during import');
      }

      return {
        userId: input.userId,
        collectionId: input.collectionId,
        name: item.name,
        status: item.status,
        iconRef: item.iconRef,
        categoryId,
        costAmount: item.costAmount,
        costFrequency: item.costFrequency,
        nextInvoiceDate: item.nextInvoiceDate,
        deactivatedAt: getImportedDeactivatedAt(item, importedAt),
      };
    });

    await recordSubscriptionSave(tx, { userId: input.userId, collectionId: input.collectionId });
    await tx.insert(subscriptionTable).values(values);

    return {
      subscriptionsImported: values.length,
      categoriesCreated: createdCount,
    };
  });
}

// The seed/clear server functions still get RPC endpoints in production builds
// even though their UI is hidden, so the server has to refuse them too.
function assertDevOnly() {
  if (!import.meta.env.DEV) {
    throw new Error('Only available in development');
  }
}

// Dev-only seeding: replace all subscriptions in a collection with a fixed sample
// set (invoice dates are generated per run). Destructive and transactional so a
// failure leaves the collection untouched.
export async function seedMySubscriptions(input: { userId: string; collectionId: string }) {
  assertDevOnly();
  await assertCollectionOwnership(input.userId, input.collectionId);

  const rows = buildSeedSubscriptions();

  return db.transaction(async (tx) => {
    const deleted = await tx
      .delete(subscriptionTable)
      .where(and(eq(subscriptionTable.userId, input.userId), eq(subscriptionTable.collectionId, input.collectionId)))
      .returning({ id: subscriptionTable.id });

    // Categories are collection-scoped; reuse existing ones or create them.
    const { categoryIdByKey } = await findOrCreateCategoriesByName(tx, {
      userId: input.userId,
      collectionId: input.collectionId,
      names: rows.map((row) => row.category),
    });

    const values = [];

    for (const row of rows) {
      const categoryId = categoryIdByKey.get(toCategoryNameKey(row.category));

      if (!categoryId) {
        throw new Error('Failed to resolve category during seeding');
      }

      values.push({
        userId: input.userId,
        name: row.name,
        status: row.status,
        iconRef: row.iconRef,
        categoryId,
        costAmount: row.costAmountCents,
        costFrequency: row.costFrequency,
        nextInvoiceDate: row.nextInvoiceDate,
        collectionId: input.collectionId,
      });
    }

    await tx.insert(subscriptionTable).values(values);

    return {
      subscriptionsDeleted: deleted.length,
      subscriptionsSeeded: rows.length,
    };
  });
}

// Dev-only: remove every subscription in a collection.
export async function clearMySubscriptions(input: { userId: string; collectionId: string }) {
  assertDevOnly();
  await assertCollectionOwnership(input.userId, input.collectionId);

  const deleted = await db
    .delete(subscriptionTable)
    .where(and(eq(subscriptionTable.userId, input.userId), eq(subscriptionTable.collectionId, input.collectionId)))
    .returning({ id: subscriptionTable.id });

  return { subscriptionsDeleted: deleted.length };
}

const SUBSCRIPTIONS_CHANGED_MESSAGE = 'Subscriptions changed. Refresh and try again.';

function assertEverySubscriptionFound(foundCount: number, expectedCount: number) {
  if (foundCount !== expectedCount) {
    throw new UserFacingError(SUBSCRIPTIONS_CHANGED_MESSAGE);
  }
}

export async function deactivateMySubscriptions(input: { userId: string; subscriptionIds: string[] }) {
  return db.transaction(async (tx) => {
    const subscriptions = await tx
      .select({ id: subscriptionTable.id })
      .from(subscriptionTable)
      .where(
        and(
          eq(subscriptionTable.userId, input.userId),
          eq(subscriptionTable.status, 'active'),
          inArray(subscriptionTable.id, input.subscriptionIds),
        ),
      )
      .for('update');

    assertEverySubscriptionFound(subscriptions.length, input.subscriptionIds.length);

    const deactivatedAt = new Date();
    const updated = await tx
      .update(subscriptionTable)
      .set({ status: 'inactive', deactivatedAt })
      .where(
        and(
          eq(subscriptionTable.userId, input.userId),
          eq(subscriptionTable.status, 'active'),
          inArray(subscriptionTable.id, input.subscriptionIds),
        ),
      )
      .returning();

    assertEverySubscriptionFound(updated.length, input.subscriptionIds.length);

    return { subscriptions: updated, deactivatedAt };
  });
}

export async function reactivateMySubscriptions(input: {
  userId: string;
  subscriptionIds: string[];
  nextInvoiceDate?: string;
}) {
  if (input.nextInvoiceDate && input.subscriptionIds.length !== 1) {
    throw new Error('A custom invoice date can only be used for one subscription');
  }

  return db.transaction(async (tx) => {
    // Invoice processing and notifications use the user's local date too.
    const processingDate = await getUserLocalDate(input.userId, new Date(), tx);

    if (input.nextInvoiceDate && input.nextInvoiceDate < processingDate) {
      throw new UserFacingError('Next invoice date must be today or later');
    }

    const subscriptions = await tx
      .select({
        id: subscriptionTable.id,
        costFrequency: subscriptionTable.costFrequency,
        nextInvoiceDate: subscriptionTable.nextInvoiceDate,
      })
      .from(subscriptionTable)
      .where(
        and(
          eq(subscriptionTable.userId, input.userId),
          eq(subscriptionTable.status, 'inactive'),
          inArray(subscriptionTable.id, input.subscriptionIds),
        ),
      )
      .for('update');

    assertEverySubscriptionFound(subscriptions.length, input.subscriptionIds.length);

    const nextInvoiceDateCases = subscriptions.map((subscription) => {
      const nextInvoiceDate =
        input.nextInvoiceDate ??
        getNextInvoiceDateOnOrAfter(subscription.nextInvoiceDate, subscription.costFrequency, processingDate);

      return sql`when ${subscription.id} then ${nextInvoiceDate}::date`;
    });
    const nextInvoiceDate = sql<string>`case ${subscriptionTable.id} ${sql.join(nextInvoiceDateCases, sql.raw(' '))} end`;
    const updated = await tx
      .update(subscriptionTable)
      .set({ status: 'active', deactivatedAt: null, nextInvoiceDate, remindersEligibleAt: new Date() })
      .where(
        and(
          eq(subscriptionTable.userId, input.userId),
          eq(subscriptionTable.status, 'inactive'),
          inArray(subscriptionTable.id, input.subscriptionIds),
        ),
      )
      .returning();

    assertEverySubscriptionFound(updated.length, input.subscriptionIds.length);
    return updated;
  });
}

export async function undoMyDeactivation(input: { userId: string; subscriptionIds: string[]; deactivatedAt: Date }) {
  return db.transaction(async (tx) => {
    const subscriptions = await tx
      .select({ id: subscriptionTable.id })
      .from(subscriptionTable)
      .where(
        and(
          eq(subscriptionTable.userId, input.userId),
          eq(subscriptionTable.status, 'inactive'),
          eq(subscriptionTable.deactivatedAt, input.deactivatedAt),
          inArray(subscriptionTable.id, input.subscriptionIds),
        ),
      )
      .for('update');

    assertEverySubscriptionFound(subscriptions.length, input.subscriptionIds.length);

    const updated = await tx
      .update(subscriptionTable)
      .set({ status: 'active', deactivatedAt: null })
      .where(
        and(
          eq(subscriptionTable.userId, input.userId),
          eq(subscriptionTable.status, 'inactive'),
          eq(subscriptionTable.deactivatedAt, input.deactivatedAt),
          inArray(subscriptionTable.id, input.subscriptionIds),
        ),
      )
      .returning();

    assertEverySubscriptionFound(updated.length, input.subscriptionIds.length);
    return updated;
  });
}

export async function deleteMySubscriptions(input: { userId: string; subscriptionIds: string[] }) {
  return db.transaction(async (tx) => {
    const subscriptions = await tx
      .select({ id: subscriptionTable.id })
      .from(subscriptionTable)
      .where(and(eq(subscriptionTable.userId, input.userId), inArray(subscriptionTable.id, input.subscriptionIds)))
      .for('update');

    assertEverySubscriptionFound(subscriptions.length, input.subscriptionIds.length);

    const deleted = await tx
      .delete(subscriptionTable)
      .where(and(eq(subscriptionTable.userId, input.userId), inArray(subscriptionTable.id, input.subscriptionIds)))
      .returning();

    assertEverySubscriptionFound(deleted.length, input.subscriptionIds.length);
    return deleted;
  });
}

/** Sets one category on several subscriptions in the same collection. */
export async function categorizeMySubscriptions(input: {
  userId: string;
  subscriptionIds: string[];
  categoryId: string;
}) {
  return db.transaction(async (tx) => {
    const subscriptionFilter = and(
      eq(subscriptionTable.userId, input.userId),
      inArray(subscriptionTable.id, input.subscriptionIds),
    );
    // Lock the rows so a concurrent move can't change their collection between
    // the category check and the update.
    const subscriptions = await tx
      .select({ collectionId: subscriptionTable.collectionId })
      .from(subscriptionTable)
      .where(subscriptionFilter)
      .for('update');

    assertEverySubscriptionFound(subscriptions.length, input.subscriptionIds.length);

    // Categories are collection-scoped, so every subscription must be in the
    // category's collection.
    const [collectionId, ...otherCollectionIds] = new Set(
      subscriptions.map((subscription) => subscription.collectionId),
    );

    if (!collectionId || otherCollectionIds.length > 0) {
      throw new UserFacingError(SUBSCRIPTIONS_CHANGED_MESSAGE);
    }

    await assertCategoryInCollection(input.userId, collectionId, input.categoryId, tx);

    const updated = await tx
      .update(subscriptionTable)
      .set({ categoryId: input.categoryId })
      .where(subscriptionFilter)
      .returning();

    assertEverySubscriptionFound(updated.length, input.subscriptionIds.length);

    return updated;
  });
}

/** A CASE expression that picks a text value per subscription ID. */
function textBySubscriptionId(valueById: [id: string, value: string | null][]) {
  const cases = valueById.map(([id, value]) => sql`when ${id} then ${value}::text`);

  return sql<string>`case ${subscriptionTable.id} ${sql.join(cases, sql.raw(' '))} end`;
}

export async function moveMySubscriptions(input: { userId: string; subscriptionIds: string[]; collectionId: string }) {
  return db.transaction(async (tx) => {
    const [targetCollection] = await tx
      .select({ id: collectionTable.id })
      .from(collectionTable)
      .where(getCollectionFilter(input.userId, input.collectionId))
      .limit(1);

    if (!targetCollection) {
      throw new Error('Collection not found');
    }

    const subscriptionFilter = and(
      eq(subscriptionTable.userId, input.userId),
      inArray(subscriptionTable.id, input.subscriptionIds),
    );
    const subscriptions = await tx
      .select({
        id: subscriptionTable.id,
        collectionId: subscriptionTable.collectionId,
        categoryId: subscriptionTable.categoryId,
        categoryName: categoryTable.name,
      })
      .from(subscriptionTable)
      .leftJoin(categoryTable, eq(subscriptionTable.categoryId, categoryTable.id))
      .where(subscriptionFilter)
      .for('update', { of: subscriptionTable });

    assertEverySubscriptionFound(subscriptions.length, input.subscriptionIds.length);

    if (subscriptions.some((subscription) => subscription.collectionId === input.collectionId)) {
      throw new UserFacingError(SUBSCRIPTIONS_CHANGED_MESSAGE);
    }

    // Categories are collection-scoped, so carry each one over by name,
    // reusing the target's matching category or creating it.
    const { categoryIdByKey } = await findOrCreateCategoriesByName(tx, {
      userId: input.userId,
      collectionId: input.collectionId,
      names: subscriptions.flatMap((subscription) => subscription.categoryName ?? []),
    });

    const movedCategoryIds = subscriptions.map(({ id, categoryName }): [string, string | null] => {
      if (categoryName === null) {
        return [id, null];
      }

      const categoryId = categoryIdByKey.get(toCategoryNameKey(categoryName));

      if (!categoryId) {
        throw new Error('Failed to resolve category during move');
      }

      return [id, categoryId];
    });

    const updated = await tx
      .update(subscriptionTable)
      // Moving changes which routes apply, so only future reminder times count.
      .set({
        collectionId: input.collectionId,
        categoryId: textBySubscriptionId(movedCategoryIds),
        remindersEligibleAt: new Date(),
      })
      .where(subscriptionFilter)
      .returning();

    assertEverySubscriptionFound(updated.length, input.subscriptionIds.length);

    return updated;
  });
}
