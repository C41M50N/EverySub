import { and, asc, eq, inArray, sql } from 'drizzle-orm';

import { dedupeCategoryNames, toCategoryNameKey } from '@/features/categories/names';
import { getMyCollection } from '@/features/collections/server';
import { db, type DbTransaction } from '@/lib/db';
import { CATEGORY_NAME_UNIQUE_CONSTRAINT, categoryTable } from '@/lib/db/category-schema';
import { isUniqueViolation } from '@/lib/db/errors';

export type Category = typeof categoryTable.$inferSelect;

async function assertCollectionOwnership(userId: string, collectionId: string) {
  const collection = await getMyCollection(userId, collectionId);

  if (!collection) {
    throw new Error('Collection not found');
  }
}

export async function listMyCategories(userId: string, collectionId: string) {
  return db
    .select()
    .from(categoryTable)
    .where(and(eq(categoryTable.userId, userId), eq(categoryTable.collectionId, collectionId)))
    .orderBy(asc(categoryTable.name));
}

/**
 * Ensures a category with this name exists in the collection and returns it.
 * Idempotent by lower(name) so JIT "Add X" is safe when the name (or a
 * case-variant of it) already exists.
 */
export async function createMyCategory(input: { userId: string; collectionId: string; name: string }) {
  await assertCollectionOwnership(input.userId, input.collectionId);

  const nameKey = toCategoryNameKey(input.name);

  const findExisting = () =>
    db
      .select()
      .from(categoryTable)
      .where(
        and(
          eq(categoryTable.userId, input.userId),
          eq(categoryTable.collectionId, input.collectionId),
          sql`lower(${categoryTable.name}) = ${nameKey}`,
        ),
      )
      .limit(1);

  const [existing] = await findExisting();

  if (existing) {
    return existing;
  }

  try {
    const [category] = await db
      .insert(categoryTable)
      .values({
        userId: input.userId,
        collectionId: input.collectionId,
        name: input.name,
      })
      .returning();

    return category;
  } catch (error) {
    // A concurrent insert may have won the race; return the existing row.
    if (isUniqueViolation(error, CATEGORY_NAME_UNIQUE_CONSTRAINT)) {
      const [existingAfterRace] = await findExisting();

      if (existingAfterRace) {
        return existingAfterRace;
      }
    }

    throw error;
  }
}

/**
 * Resolves category names to IDs in one collection, creating any that don't
 * exist yet. Runs inside the caller's transaction so created categories roll
 * back with it.
 *
 * `categoryIdByKey` is keyed by `toCategoryNameKey(name)`. `createdCount` is
 * how many categories this call inserted.
 */
export async function findOrCreateCategoriesByName(
  tx: DbTransaction,
  input: { userId: string; collectionId: string; names: Iterable<string> },
) {
  const names = dedupeCategoryNames(input.names);
  const categoryIdByKey = new Map<string, string>();
  let createdCount = 0;

  if (names.length === 0) {
    return { categoryIdByKey, createdCount };
  }

  const selectByKeys = (keys: string[]) =>
    tx
      .select({ id: categoryTable.id, name: categoryTable.name })
      .from(categoryTable)
      .where(
        and(
          eq(categoryTable.userId, input.userId),
          eq(categoryTable.collectionId, input.collectionId),
          inArray(sql`lower(${categoryTable.name})`, keys),
        ),
      );
  const addToMapping = (categories: { id: string; name: string }[]) => {
    for (const category of categories) {
      categoryIdByKey.set(toCategoryNameKey(category.name), category.id);
    }
  };
  const getMissingNames = () => names.filter((name) => !categoryIdByKey.has(toCategoryNameKey(name)));

  addToMapping(await selectByKeys(names.map(toCategoryNameKey)));

  const namesToCreate = getMissingNames();

  if (namesToCreate.length > 0) {
    const created = await tx
      .insert(categoryTable)
      .values(namesToCreate.map((name) => ({ userId: input.userId, collectionId: input.collectionId, name })))
      .onConflictDoNothing()
      .returning({ id: categoryTable.id, name: categoryTable.name });

    addToMapping(created);
    createdCount = created.length;

    // A concurrent insert may have won the race for some names; those rows
    // exist now, so read them back.
    const racedNames = getMissingNames();

    if (racedNames.length > 0) {
      addToMapping(await selectByKeys(racedNames.map(toCategoryNameKey)));
    }

    if (getMissingNames().length > 0) {
      throw new Error('Failed to resolve categories');
    }
  }

  return { categoryIdByKey, createdCount };
}

/** Throws unless the category exists and belongs to this user's collection. */
export async function assertCategoryInCollection(
  userId: string,
  collectionId: string,
  categoryId: string,
  executor: typeof db | DbTransaction = db,
) {
  const [category] = await executor
    .select({ id: categoryTable.id })
    .from(categoryTable)
    .where(
      and(
        eq(categoryTable.id, categoryId),
        eq(categoryTable.userId, userId),
        eq(categoryTable.collectionId, collectionId),
      ),
    )
    .limit(1);

  if (!category) {
    throw new Error('Category not found');
  }
}
