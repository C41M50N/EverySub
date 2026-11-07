import { and, asc, eq } from 'drizzle-orm';

import { STARTER_CATEGORY_NAMES } from '@/features/categories/names';
import { LAST_COLLECTION_DELETE_MESSAGE } from '@/features/collections/schema';
import { db, type DbTransaction } from '@/lib/db';
import { categoryTable } from '@/lib/db/category-schema';
import { COLLECTION_NAME_UNIQUE_CONSTRAINT, collectionTable } from '@/lib/db/collection-schema';
import { isUniqueViolation } from '@/lib/db/errors';
import { subscriptionTable } from '@/lib/db/subscription-schema';
import { UserFacingError } from '@/lib/errors';

export type Collection = typeof collectionTable.$inferSelect;

const DUPLICATE_COLLECTION_NAME_MESSAGE = 'A collection with this name already exists';

export function getCollectionFilter(userId: string, collectionId: string) {
  return and(eq(collectionTable.userId, userId), eq(collectionTable.id, collectionId));
}

/**
 * Builds a copy name that does not collide with any of the user's existing
 * collection names, e.g. "Name (copy)", "Name (copy 2)", "Name (copy 3)".
 * Collision checks are case-insensitive to match the DB uniqueness rule.
 */
function buildUniqueCopyName(baseName: string, existingNames: Set<string>): string {
  const takenLower = new Set([...existingNames].map((name) => name.toLowerCase()));
  const isTaken = (candidate: string) => takenLower.has(candidate.toLowerCase());

  const firstCandidate = `${baseName} (copy)`;

  if (!isTaken(firstCandidate)) {
    return firstCandidate;
  }

  let suffix = 2;

  while (isTaken(`${baseName} (copy ${suffix})`)) {
    suffix += 1;
  }

  return `${baseName} (copy ${suffix})`;
}

export async function listMyCollections(userId: string) {
  return db.select().from(collectionTable).where(eq(collectionTable.userId, userId)).orderBy(asc(collectionTable.name));
}

export async function getMyCollection(userId: string, collectionId: string) {
  const [collection] = await db
    .select()
    .from(collectionTable)
    .where(getCollectionFilter(userId, collectionId))
    .limit(1);

  return collection ?? null;
}

/** Inserts a new collection with the starter categories. */
export async function insertCollection(tx: DbTransaction, input: { userId: string; name: string }) {
  const [collection] = await tx
    .insert(collectionTable)
    .values({
      userId: input.userId,
      name: input.name,
    })
    .returning();

  await tx
    .insert(categoryTable)
    .values(STARTER_CATEGORY_NAMES.map((name) => ({ userId: input.userId, collectionId: collection.id, name })));

  return collection;
}

export async function createMyCollection(input: { userId: string; name: string }) {
  try {
    return await db.transaction((tx) => insertCollection(tx, input));
  } catch (error) {
    if (isUniqueViolation(error, COLLECTION_NAME_UNIQUE_CONSTRAINT)) {
      throw new UserFacingError(DUPLICATE_COLLECTION_NAME_MESSAGE);
    }

    throw error;
  }
}

export async function renameMyCollection(input: { userId: string; collectionId: string; name: string }) {
  let collection: Collection | undefined;

  try {
    [collection] = await db
      .update(collectionTable)
      .set({
        name: input.name,
      })
      .where(getCollectionFilter(input.userId, input.collectionId))
      .returning();
  } catch (error) {
    if (isUniqueViolation(error, COLLECTION_NAME_UNIQUE_CONSTRAINT)) {
      throw new UserFacingError(DUPLICATE_COLLECTION_NAME_MESSAGE);
    }

    throw error;
  }

  if (!collection) {
    throw new Error('Collection not found');
  }

  return collection;
}

export async function duplicateMyCollection(input: { userId: string; collectionId: string }) {
  return db.transaction(async (tx) => {
    const [original] = await tx
      .select()
      .from(collectionTable)
      .where(getCollectionFilter(input.userId, input.collectionId))
      .limit(1);

    if (!original) {
      throw new Error('Collection not found');
    }

    const existingNames = new Set(
      (
        await tx
          .select({ name: collectionTable.name })
          .from(collectionTable)
          .where(eq(collectionTable.userId, input.userId))
      ).map((row) => row.name),
    );

    const [collection] = await tx
      .insert(collectionTable)
      .values({
        userId: input.userId,
        name: buildUniqueCopyName(original.name, existingNames),
      })
      .returning();

    // Categories are collection-scoped, so copy them into the new collection
    // first and remap each subscription's categoryId to its copy.
    const sourceCategories = await tx
      .select()
      .from(categoryTable)
      .where(and(eq(categoryTable.userId, input.userId), eq(categoryTable.collectionId, input.collectionId)));

    const newCategoryIdByOldId = new Map<string, string>();

    if (sourceCategories.length > 0) {
      const insertedCategories = await tx
        .insert(categoryTable)
        .values(
          sourceCategories.map((category) => ({
            userId: category.userId,
            collectionId: collection.id,
            name: category.name,
          })),
        )
        .returning({ id: categoryTable.id, name: categoryTable.name });

      const newIdByName = new Map(insertedCategories.map((category) => [category.name, category.id]));

      for (const category of sourceCategories) {
        const newId = newIdByName.get(category.name);

        if (newId) {
          newCategoryIdByOldId.set(category.id, newId);
        }
      }
    }

    const subscriptions = await tx
      .select()
      .from(subscriptionTable)
      .where(and(eq(subscriptionTable.userId, input.userId), eq(subscriptionTable.collectionId, input.collectionId)));

    if (subscriptions.length > 0) {
      await tx.insert(subscriptionTable).values(
        subscriptions.map((subscription) => ({
          userId: subscription.userId,
          name: subscription.name,
          status: subscription.status,
          deactivatedAt: subscription.deactivatedAt,
          iconRef: subscription.iconRef,
          categoryId: subscription.categoryId ? (newCategoryIdByOldId.get(subscription.categoryId) ?? null) : null,
          costAmount: subscription.costAmount,
          costFrequency: subscription.costFrequency,
          nextInvoiceDate: subscription.nextInvoiceDate,
          notificationsIncluded: subscription.notificationsIncluded,
          collectionId: collection.id,
        })),
      );
    }

    return collection;
  });
}

/** Deletes a collection and everything in it, unless it's the user's last one. */
export async function deleteMyCollection(input: { userId: string; collectionId: string }) {
  return db.transaction(async (tx) => {
    // Locking all of the user's collections, in a fixed order, serializes
    // deletions, so two overlapping requests can't each see another collection
    // remaining and delete both.
    const collections = await tx
      .select({ id: collectionTable.id })
      .from(collectionTable)
      .where(eq(collectionTable.userId, input.userId))
      .orderBy(asc(collectionTable.id))
      .for('update');

    if (!collections.some((collection) => collection.id === input.collectionId)) {
      throw new Error('Collection not found');
    }

    if (collections.length === 1) {
      throw new UserFacingError(LAST_COLLECTION_DELETE_MESSAGE);
    }

    const [collection] = await tx
      .delete(collectionTable)
      .where(getCollectionFilter(input.userId, input.collectionId))
      .returning();

    return collection;
  });
}
