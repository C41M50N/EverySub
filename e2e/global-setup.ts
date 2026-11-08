// Brings the test database up to date before the browser tests, with the same
// migrations the database tests apply. Nothing is truncated: every test seeds
// its own user, so tests can run in parallel and leftovers don't matter.
export { setup as default } from '@/test/db-global-setup';
