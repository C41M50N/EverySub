import { afterAll, beforeEach } from 'vitest';

import { db } from '@/lib/db';
import { resetDatabase } from '@/test/reset-database';

// Every database test starts from empty tables. Seeding what a test needs
// keeps each one self-contained and readable on its own.
beforeEach(resetDatabase);

afterAll(async () => {
  await db.$client.end();
});
