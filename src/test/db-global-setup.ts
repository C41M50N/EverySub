import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { ENV } from 'varlock/env';

import { db } from '@/lib/db';

// Brings the test database up to date once per run, using the same committed
// migrations production applies. Tests then only need to empty tables.
export async function setup() {
  try {
    await db.execute(sql`select 1`);
  } catch (error) {
    throw new Error(
      `Database tests need Postgres at ${ENV.DATABASE_URL}. Start it with \`docker compose up --detach --wait\`.`,
      { cause: error },
    );
  }

  await migrate(db, { migrationsFolder: 'drizzle' });
  await db.$client.end();
}
