// Postgres error code for a unique-constraint violation.
const PG_UNIQUE_VIOLATION = '23505';

/**
 * True when an error, or any error in its `cause` chain, is a Postgres
 * unique-constraint violation on `constraint`. Drizzle wraps driver errors in a
 * DrizzleQueryError, so the pg error sits in `cause` rather than at the top.
 */
export function isUniqueViolation(error: unknown, constraint: string): boolean {
  for (let current = error; current instanceof Error; current = current.cause) {
    if (
      'code' in current &&
      current.code === PG_UNIQUE_VIOLATION &&
      'constraint' in current &&
      current.constraint === constraint
    ) {
      return true;
    }
  }

  return false;
}
