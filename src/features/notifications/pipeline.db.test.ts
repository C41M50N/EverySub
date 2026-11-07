import { EventEmitter } from 'node:events';
import type { RequestOptions } from 'node:https';

import { asc, eq } from 'drizzle-orm';
import { beforeEach, expect, it, vi } from 'vitest';

import { deliverDueNotifications } from '@/features/notifications/delivery';
import { pruneNotificationHistory } from '@/features/notifications/maintenance';
import { scheduleDueNotifications } from '@/features/notifications/scheduler';
import {
  createMyWebhookDestination,
  setMyDestinationPaused,
  setMyRoute,
  setMySubscriptionsInclusion,
} from '@/features/notifications/server';
import { createMySubscription } from '@/features/subscriptions/server';
import { db } from '@/lib/db';
import {
  notificationAttemptTable,
  notificationDestinationTable,
  notificationEventTable,
  notificationReminderClaimTable,
  notificationRouteTable,
  notificationSettingsTable,
  resendWebhookEventTable,
  type NotificationKind,
} from '@/lib/db/notification-schema';
import { subscriptionTable } from '@/lib/db/subscription-schema';
import { seedAccount } from '@/test/db';

// DNS, the outbound HTTPS connection, and the Resend SDK are the external
// boundaries. Scheduling, content building, signing, and every state change
// run for real against the database.
const { lookup, request, send } = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn(), send: vi.fn() }));

vi.mock('node:dns/promises', () => ({ lookup }));
vi.mock('node:https', () => ({ request }));
vi.mock('resend', () => ({
  Resend: class {
    emails = { send };
  },
}));

type SentRequest = { hostname: string; headers: Record<string, string>; body: unknown };

/** Every webhook request that reached the network, in order. */
const sent: SentRequest[] = [];

/** The status each webhook host answers with. A promise holds the response open. */
const respond = vi.fn<(hostname: string) => number | Promise<number>>();

beforeEach(() => {
  sent.length = 0;
  send.mockReset();
  lookup.mockReset();
  lookup.mockResolvedValue([{ address: '93.184.215.14', family: 4 }]);
  respond.mockReset();
  respond.mockReturnValue(204);
  request.mockImplementation((options: RequestOptions, onResponse: (response: EventEmitter) => void) =>
    Object.assign(new EventEmitter(), {
      end: (body: string) => {
        const hostname = String(options.hostname);
        sent.push({ hostname, headers: options.headers as Record<string, string>, body: JSON.parse(body) });

        void Promise.resolve(respond(hostname)).then((statusCode) => {
          const response = Object.assign(new EventEmitter(), { statusCode, headers: {}, destroy: () => {} });

          onResponse(response);
          response.emit('end');
        });
      },
      destroy: () => {},
    }),
  );
});

// Setup functions stamp the wall clock, while scenarios run on fixed dates in
// early 2026. Backdating makes the account look set up well before then.
const SET_UP_AT = new Date('2025-12-01T00:00:00Z');

async function backdateSetup(userId: string) {
  await db
    .update(notificationSettingsTable)
    .set({ timingChangedAt: SET_UP_AT })
    .where(eq(notificationSettingsTable.userId, userId));
  await db
    .update(notificationRouteTable)
    .set({ createdAt: SET_UP_AT })
    .where(eq(notificationRouteTable.userId, userId));
  await db
    .update(subscriptionTable)
    .set({ remindersEligibleAt: SET_UP_AT })
    .where(eq(subscriptionTable.userId, userId));
}

async function addWebhook(
  account: { userId: string; collectionId: string },
  host: string,
  kinds: NotificationKind[] = ['renewal_reminder'],
) {
  const { destinationId } = await createMyWebhookDestination({
    userId: account.userId,
    type: 'webhook',
    name: host,
    url: `https://${host}/everysub`,
  });

  for (const kind of kinds) {
    await setMyRoute({ ...account, destinationId, kind, enabled: true, reviewedInclusion: [] });
  }

  return destinationId;
}

/**
 * An email destination routed for reminders while this server could send
 * email. It can't now: the test environment has no Resend webhook secret, so
 * bounces and complaints couldn't be heard. The setup functions refuse to
 * create one in this state, so it's inserted directly.
 */
async function addUnsendableEmail(account: { userId: string; collectionId: string }) {
  const [email] = await db
    .insert(notificationDestinationTable)
    .values({ userId: account.userId, type: 'email', name: 'Email' })
    .returning();
  await db.insert(notificationRouteTable).values({ ...account, destinationId: email.id, kind: 'renewal_reminder' });

  return email;
}

/**
 * A New York account with one subscription renewing on January 13 and a
 * webhook receiving reminders. With the default three-day lead time, its
 * reminder is due at 9 a.m. on January 10 (14:00 UTC).
 */
async function seedReminderScenario() {
  const account = await seedAccount();
  const subscription = await createMySubscription({
    ...account,
    name: 'Streamline Video',
    iconRef: 'example.com',
    costAmount: 1599,
    costFrequency: 'monthly',
    nextInvoiceDate: '2026-01-13',
  });
  const destinationId = await addWebhook(account, 'a.example.com');
  await backdateSetup(account.userId);

  return { ...account, subscriptionId: subscription.id, destinationId };
}

function deliver(at: string, limit?: number) {
  return deliverDueNotifications({ clock: () => new Date(at), limit });
}

async function readEvents() {
  return db.select().from(notificationEventTable).orderBy(asc(notificationEventTable.scheduledFor));
}

async function readAttempts(eventId: string) {
  return db
    .select({
      attemptNumber: notificationAttemptTable.attemptNumber,
      outcome: notificationAttemptTable.outcome,
      statusCode: notificationAttemptTable.statusCode,
    })
    .from(notificationAttemptTable)
    .where(eq(notificationAttemptTable.eventId, eventId))
    .orderBy(asc(notificationAttemptTable.attemptNumber));
}

async function readDestination(destinationId: string) {
  const [destination] = await db
    .select()
    .from(notificationDestinationTable)
    .where(eq(notificationDestinationTable.id, destinationId));

  return destination;
}

async function readClaims() {
  return db
    .select({
      destinationId: notificationReminderClaimTable.destinationId,
      subscriptionId: notificationReminderClaimTable.subscriptionId,
      invoiceDate: notificationReminderClaimTable.invoiceDate,
    })
    .from(notificationReminderClaimTable);
}

it('schedules one event per active destination and period, however often the job runs', async () => {
  const account = await seedAccount();
  const active = await addWebhook(account, 'a.example.com', ['renewal_reminder', 'monthly_overview']);
  const paused = await addWebhook(account, 'b.example.com');
  await setMyDestinationPaused({ userId: account.userId, destinationId: paused, paused: true });

  await addUnsendableEmail(account);
  await backdateSetup(account.userId);

  // 10 a.m. on February 3 in New York: today's reminder and, within the
  // first week, February's overview are both due.
  const now = new Date('2026-02-03T15:00:00Z');

  expect(await scheduleDueNotifications({ now })).toEqual({ created: 2 });
  expect(await scheduleDueNotifications({ now: new Date('2026-02-03T15:05:00Z') })).toEqual({ created: 0 });

  const events = await readEvents();
  expect(
    events.map(({ destinationId, kind, periodKey, scheduledFor, status }) => ({
      destinationId,
      kind,
      periodKey,
      scheduledFor,
      status,
    })),
  ).toEqual([
    {
      destinationId: active,
      kind: 'monthly_overview',
      periodKey: '2026-02',
      scheduledFor: new Date('2026-02-01T14:00:00Z'),
      status: 'pending',
    },
    {
      destinationId: active,
      kind: 'renewal_reminder',
      periodKey: '2026-02-03',
      scheduledFor: new Date('2026-02-03T14:00:00Z'),
      status: 'pending',
    },
  ]);
});

it('schedules each user’s reminder for 9 a.m. in their own time zone', async () => {
  const newYork = await seedAccount({ timeZone: 'America/New_York' });
  const tokyo = await seedAccount({ timeZone: 'Asia/Tokyo' });
  await addWebhook(newYork, 'ny.example.com');
  await addWebhook(tokyo, 'tokyo.example.com');
  await backdateSetup(newYork.userId);
  await backdateSetup(tokyo.userId);

  // 8:30 a.m. on January 10 in New York, so its latest 9 a.m. was yesterday's.
  // 10:30 p.m. on January 10 in Tokyo.
  expect(await scheduleDueNotifications({ now: new Date('2026-01-10T13:30:00Z') })).toEqual({ created: 2 });

  const events = await readEvents();
  expect(
    events.map(({ userId, periodKey, scheduledFor, timeZone }) => ({
      userId,
      periodKey,
      scheduledFor,
      timeZone,
    })),
  ).toEqual([
    {
      userId: newYork.userId,
      periodKey: '2026-01-09',
      scheduledFor: new Date('2026-01-09T14:00:00Z'),
      timeZone: 'America/New_York',
    },
    {
      userId: tokyo.userId,
      periodKey: '2026-01-10',
      scheduledFor: new Date('2026-01-10T00:00:00Z'),
      timeZone: 'Asia/Tokyo',
    },
  ]);
});

it('sends a due reminder once and never repeats its renewal in a later reminder', async () => {
  const { subscriptionId, destinationId, collectionId } = await seedReminderScenario();
  const sentAt = new Date('2026-01-10T15:00:00Z');

  await scheduleDueNotifications({ now: sentAt });

  expect(await deliver('2026-01-10T15:00:00Z')).toEqual({
    attempted: 1,
    succeeded: 1,
    retrying: 0,
    failed: 0,
    cancelled: 0,
    skipped: 0,
  });

  const [event] = await readEvents();
  expect(event).toMatchObject({
    status: 'succeeded',
    attemptCount: 1,
    succeededAt: sentAt,
    completedAt: sentAt,
    nextAttemptAt: null,
    leaseToken: null,
    leaseExpiresAt: null,
    lastError: null,
  });
  expect(await readAttempts(event.id)).toEqual([{ attemptNumber: 1, outcome: 'succeeded', statusCode: 204 }]);
  expect(await readDestination(destinationId)).toMatchObject({ lastSuccessAt: sentAt, consecutiveFailedEvents: 0 });

  expect(sent).toHaveLength(1);
  expect(sent[0].headers['webhook-id']).toBe(event.id);
  expect(sent[0].body).toMatchObject({
    id: event.id,
    type: 'renewal_reminder',
    data: {
      itemCount: 1,
      collections: [
        {
          id: collectionId,
          name: 'Personal',
          items: [
            { subscriptionId, name: 'Streamline Video', expectedInvoiceDate: '2026-01-13', expectedAmountCents: 1599 },
          ],
        },
      ],
    },
  });

  // A later run finds nothing left to send.
  expect(await deliver('2026-01-10T16:00:00Z')).toMatchObject({ attempted: 0 });

  // The next day's reminder would still cover the January 13 renewal, but
  // this destination was already told about it.
  await scheduleDueNotifications({ now: new Date('2026-01-11T15:00:00Z') });
  expect(await deliver('2026-01-11T15:00:00Z')).toMatchObject({ attempted: 1, skipped: 1 });
  expect(sent).toHaveLength(1);
  expect(await readClaims()).toEqual([{ destinationId, subscriptionId, invoiceDate: '2026-01-13' }]);
});

it('retries temporary failures with backoff, then fails the event and pauses a destination that keeps failing', async () => {
  const { destinationId } = await seedReminderScenario();
  // Two earlier events in a row already exhausted their retries.
  await db
    .update(notificationDestinationTable)
    .set({ consecutiveFailedEvents: 2 })
    .where(eq(notificationDestinationTable.id, destinationId));
  respond.mockReturnValue(503);

  await scheduleDueNotifications({ now: new Date('2026-01-10T15:00:00Z') });

  expect(await deliver('2026-01-10T15:00:00Z')).toMatchObject({ attempted: 1, retrying: 1 });

  const [retrying] = await readEvents();
  expect(retrying).toMatchObject({
    status: 'retrying',
    attemptCount: 1,
    leaseToken: null,
    leaseExpiresAt: null,
    lastError: 'The endpoint returned a temporary error (503).',
  });
  // The first retry waits two minutes, give or take 20% jitter.
  const retryAt = retrying.nextAttemptAt?.getTime() ?? 0;
  expect(retryAt).toBeGreaterThanOrEqual(Date.parse('2026-01-10T15:01:36Z'));
  expect(retryAt).toBeLessThanOrEqual(Date.parse('2026-01-10T15:02:24Z'));
  expect(await readDestination(destinationId)).toMatchObject({ consecutiveFailedEvents: 2, pausedAt: null });

  expect(await deliver('2026-01-10T15:01:00Z')).toMatchObject({ attempted: 0 });

  // Every retry delay is under an hour, so hourly runs pick each one up.
  for (const at of ['2026-01-10T16:00:00Z', '2026-01-10T17:00:00Z', '2026-01-10T18:00:00Z']) {
    expect(await deliver(at)).toMatchObject({ attempted: 1, retrying: 1 });
  }

  const failedAt = new Date('2026-01-10T19:00:00Z');
  expect(await deliver('2026-01-10T19:00:00Z')).toMatchObject({ attempted: 1, failed: 1 });

  const [failed] = await readEvents();
  expect(failed).toMatchObject({ status: 'failed', attemptCount: 5, nextAttemptAt: null, completedAt: failedAt });
  expect(await readAttempts(failed.id)).toEqual(
    [1, 2, 3, 4, 5].map((attemptNumber) => ({ attemptNumber, outcome: 'temporary_failure', statusCode: 503 })),
  );
  // Receivers deduplicate on the event ID, so every attempt carries the same one.
  expect(sent.map((request) => request.headers['webhook-id'])).toEqual([
    failed.id,
    failed.id,
    failed.id,
    failed.id,
    failed.id,
  ]);
  // The renewal is free for a later reminder to carry.
  expect(await readClaims()).toEqual([]);
  expect(await readDestination(destinationId)).toMatchObject({
    consecutiveFailedEvents: 3,
    lastFailureAt: failedAt,
    pausedAt: failedAt,
    pauseReason: 'failing',
    pauseMessage:
      'Paused after 3 notifications in a row couldn’t be delivered. Last error: The endpoint returned a temporary error (503).',
  });
});

it('pauses only the destination that permanently rejects, and caps each run at its limit', async () => {
  const scenario = await seedReminderScenario();
  const rejecting = scenario.destinationId;
  const accepting = await addWebhook(scenario, 'b.example.com');
  await backdateSetup(scenario.userId);
  respond.mockImplementation((hostname) => (hostname === 'a.example.com' ? 404 : 204));
  const at = new Date('2026-01-10T15:00:00Z');

  expect(await scheduleDueNotifications({ now: at })).toEqual({ created: 2 });

  expect(await deliver('2026-01-10T15:00:00Z', 1)).toMatchObject({ attempted: 1 });
  expect(await deliver('2026-01-10T15:00:00Z', 1)).toMatchObject({ attempted: 1 });
  expect(await deliver('2026-01-10T15:00:00Z')).toMatchObject({ attempted: 0 });

  const events = await readEvents();
  expect(events.find((event) => event.destinationId === rejecting)).toMatchObject({
    status: 'failed',
    attemptCount: 1,
    completedAt: at,
    lastError: 'The endpoint rejected the request (404).',
  });
  expect(events.find((event) => event.destinationId === accepting)).toMatchObject({ status: 'succeeded' });

  expect(await readDestination(rejecting)).toMatchObject({
    pausedAt: at,
    pauseReason: 'rejected',
    pauseMessage: 'The endpoint rejected the request (404).',
    consecutiveFailedEvents: 0,
  });
  expect(await readDestination(accepting)).toMatchObject({ pausedAt: null, lastSuccessAt: at, lastFailureAt: null });

  // The rejected event let go of the renewal; the delivered one keeps it.
  expect(await readClaims()).toEqual([
    { destinationId: accepting, subscriptionId: scenario.subscriptionId, invoiceDate: '2026-01-13' },
  ]);
});

it('cancels a retry without sending once its only subscription is excluded from notifications', async () => {
  const { userId, subscriptionId, destinationId } = await seedReminderScenario();
  respond.mockReturnValueOnce(503);

  await scheduleDueNotifications({ now: new Date('2026-01-10T15:00:00Z') });
  expect(await deliver('2026-01-10T15:00:00Z')).toMatchObject({ retrying: 1 });

  await setMySubscriptionsInclusion({ userId, subscriptionIds: [subscriptionId], included: false });

  expect(await deliver('2026-01-10T16:00:00Z')).toMatchObject({ attempted: 1, cancelled: 1 });
  expect(sent).toHaveLength(1);

  const [event] = await readEvents();
  expect(event).toMatchObject({
    status: 'cancelled',
    attemptCount: 2,
    completedAt: new Date('2026-01-10T16:00:00Z'),
    lastError: 'No renewals are eligible for this reminder.',
  });
  expect(await readAttempts(event.id)).toEqual([
    { attemptNumber: 1, outcome: 'temporary_failure', statusCode: 503 },
    { attemptNumber: 2, outcome: 'cancelled', statusCode: null },
  ]);
  expect(await readClaims()).toEqual([]);
  // Nothing went wrong on the destination's side.
  expect(await readDestination(destinationId)).toMatchObject({ consecutiveFailedEvents: 0, pausedAt: null });
});

it('takes over an event whose worker outlived its lease, and ignores that worker’s late result', async () => {
  const { destinationId } = await seedReminderScenario();
  let answerFirstRequest: (status: number) => void = () => {};
  respond.mockReturnValueOnce(
    new Promise<number>((resolve) => {
      answerFirstRequest = resolve;
    }),
  );

  await scheduleDueNotifications({ now: new Date('2026-01-10T15:00:00Z') });

  // The first worker claims the event and hangs on the request.
  const stalled = deliver('2026-01-10T15:00:00Z');
  await vi.waitFor(() => expect(sent).toHaveLength(1));

  // Its two-minute lease still holds.
  expect(await deliver('2026-01-10T15:01:00Z')).toMatchObject({ attempted: 0 });

  const takenOverAt = new Date('2026-01-10T15:03:00Z');
  expect(await deliver('2026-01-10T15:03:00Z')).toMatchObject({ attempted: 1, succeeded: 1 });

  // The first worker's request finally fails, after the event was delivered.
  answerFirstRequest(503);
  await stalled;

  const [event] = await readEvents();
  expect(event).toMatchObject({
    status: 'succeeded',
    attemptCount: 2,
    succeededAt: takenOverAt,
    nextAttemptAt: null,
    lastError: null,
  });
  expect(await readAttempts(event.id)).toEqual([{ attemptNumber: 2, outcome: 'succeeded', statusCode: 204 }]);
  expect(await readDestination(destinationId)).toMatchObject({ lastSuccessAt: takenOverAt, lastFailureAt: null });
});

it('cancels an email event without contacting Resend when this server can’t send email', async () => {
  const account = await seedAccount();
  await createMySubscription({
    ...account,
    name: 'Streamline Video',
    iconRef: 'example.com',
    costAmount: 1599,
    costFrequency: 'monthly',
    nextInvoiceDate: '2026-01-13',
  });
  const email = await addUnsendableEmail(account);
  await backdateSetup(account.userId);

  // Scheduled back when email was available.
  await db.insert(notificationEventTable).values({
    userId: account.userId,
    destinationId: email.id,
    kind: 'renewal_reminder',
    periodKey: '2026-01-10',
    scheduledFor: new Date('2026-01-10T14:00:00Z'),
    timeZone: 'America/New_York',
    nextAttemptAt: new Date('2026-01-10T14:00:00Z'),
  });

  expect(await deliver('2026-01-10T15:00:00Z')).toMatchObject({ attempted: 1, cancelled: 1 });

  expect(send).not.toHaveBeenCalled();
  const [event] = await readEvents();
  expect(event).toMatchObject({
    status: 'cancelled',
    lastError: 'Email delivery isn’t set up on this EverySub server.',
  });
  expect(await readDestination(email.id)).toMatchObject({ pausedAt: null, lastFailureAt: null });
});

it('prunes old delivery history while keeping what reminders and health still need', async () => {
  const { userId, subscriptionId, destinationId } = await seedReminderScenario();
  const now = new Date('2026-06-30T12:00:00Z');

  const events = await db
    .insert(notificationEventTable)
    .values(
      (
        [
          ['2026-05-29', 'skipped', '2026-05-29T12:00:00Z'],
          ['2026-05-30', 'cancelled', '2026-05-29T12:00:00Z'],
          ['2026-06-05', 'skipped', '2026-06-05T12:00:00Z'],
          ['2026-05-01', 'succeeded', '2026-05-01T12:00:00Z'],
          ['2026-01-15', 'succeeded', '2026-01-15T12:00:00Z'],
          ['2025-12-01', 'succeeded', '2025-12-01T12:00:00Z'],
          ['2025-12-02', 'failed', '2025-12-02T12:00:00Z'],
        ] as const
      ).map(([periodKey, status, createdAt]) => ({
        userId,
        destinationId,
        kind: 'renewal_reminder' as const,
        periodKey,
        status,
        scheduledFor: new Date(`${periodKey}T13:00:00Z`),
        timeZone: 'America/New_York',
        createdAt: new Date(createdAt),
      })),
    )
    .returning({ id: notificationEventTable.id, periodKey: notificationEventTable.periodKey });
  const eventId = (periodKey: string) => events.find((event) => event.periodKey === periodKey)?.id ?? '';

  await db.insert(notificationAttemptTable).values(
    ['2026-05-01', '2025-12-01'].map((periodKey) => ({
      eventId: eventId(periodKey),
      attemptNumber: 1,
      outcome: 'succeeded' as const,
      startedAt: new Date(`${periodKey}T13:00:00Z`),
    })),
  );
  await db.insert(notificationReminderClaimTable).values(
    ['2026-06-22', '2026-06-23'].map((invoiceDate) => ({
      destinationId,
      subscriptionId,
      invoiceDate,
      eventId: eventId('2026-05-01'),
    })),
  );
  await db.insert(resendWebhookEventTable).values([
    { id: 'msg_old', type: 'email.delivered', receivedAt: new Date('2026-05-29T12:00:00Z') },
    { id: 'msg_recent', type: 'email.delivered', receivedAt: new Date('2026-06-05T12:00:00Z') },
  ]);

  await pruneNotificationHistory({ now });

  // Empty events go after 30 days, sent and failed ones after 180.
  expect((await readEvents()).map((event) => event.periodKey)).toEqual(['2026-01-15', '2026-05-01', '2026-06-05']);
  expect(await db.select({ eventId: notificationAttemptTable.eventId }).from(notificationAttemptTable)).toEqual([
    { eventId: eventId('2026-05-01') },
  ]);
  // Claims for renewals more than a week past can't matter anymore.
  expect((await readClaims()).map((claim) => claim.invoiceDate)).toEqual(['2026-06-23']);
  expect(await db.select({ id: resendWebhookEventTable.id }).from(resendWebhookEventTable)).toEqual([
    { id: 'msg_recent' },
  ]);
});
