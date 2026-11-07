import { sql } from 'drizzle-orm';

import { db } from '@/lib/db';

/**
 * Empties every application table. Migration bookkeeping lives in the
 * `drizzle` schema and is untouched.
 *
 * This lives apart from the seed helpers on purpose: the setup file imports
 * it before each test file runs, and anything imported there is loaded before
 * the test file's `vi.mock` calls. The seed helpers pull in the app's server
 * modules, so they are imported by test files, not by setup.
 */
export async function resetDatabase() {
  const { rows } = await db.execute<{ tablename: string }>(
    sql`select tablename from pg_tables where schemaname = 'public'`,
  );

  if (rows.length === 0) {
    return;
  }

  const tables = rows.map((row) => `"${row.tablename}"`).join(', ');

  await db.execute(sql.raw(`truncate table ${tables} restart identity cascade`));
}
