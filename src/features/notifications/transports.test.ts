import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildReminderContent, type ReminderItem } from '@/features/notifications/content';
import { prepareDelivery, type DeliveryDestination } from '@/features/notifications/transports';

// The Resend SDK is the external boundary. Rendering, request identity, and
// the send wrapper all run for real.
const { send } = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock('resend', () => ({
  Resend: class {
    emails = { send };
  },
}));

vi.mock('varlock/env', async (importOriginal) => ({
  ...(await importOriginal<typeof import('varlock/env')>()),
  ENV: { RESEND_API_KEY: 're_test', RESEND_FROM_ADDRESS: 'EverySub <notify@mail.example.com>' },
}));

const emailDestination: DeliveryDestination = {
  id: 'dest-email',
  type: 'email',
  name: 'Email',
  webhookUrl: null,
  signingSecret: null,
  retiredSigningSecrets: [],
};

const video: ReminderItem = {
  subscriptionId: 'sub-video',
  collectionId: 'personal',
  name: 'Streamline Video',
  iconRef: 'example.com',
  expectedDate: '2026-10-07',
  amountCents: 1599,
};

const music: ReminderItem = {
  subscriptionId: 'sub-music',
  collectionId: 'personal',
  name: 'Tunebox Family',
  iconRef: 'example.com',
  expectedDate: '2026-10-06',
  amountCents: 1699,
};

/** Each attempt rebuilds its content from current state, as delivery does. */
function reminder(items: ReminderItem[]) {
  return buildReminderContent({
    meta: {
      eventId: 'evt_1',
      test: false,
      timeZone: 'America/New_York',
      localDate: '2026-10-04',
      scheduledFor: new Date('2026-10-04T13:00:00Z'),
    },
    leadDays: 3,
    items,
    collectionNames: new Map([['personal', 'Personal']]),
  });
}

async function attempt(input: { items: ReminderItem[]; recipient: string; at: string }) {
  const prepared = await prepareDelivery({
    destination: emailDestination,
    content: reminder(input.items),
    recipientEmail: input.recipient,
    manageUrl: 'https://everysub.example/settings/notifications',
    now: () => new Date(input.at),
  });

  await prepared.send();

  const [request, options] = send.mock.lastCall ?? [];

  return { requestKey: prepared.requestKey, to: request.to, idempotencyKey: options.idempotencyKey };
}

beforeEach(() => {
  send.mockReset();
  send.mockResolvedValue({ data: { id: 'email_1' }, error: null, headers: {} });
});

describe('email request identity', () => {
  const first = { items: [video, music], recipient: 'owner@example.com', at: '2026-10-04T13:00:00Z' };

  it('reuses the Resend idempotency key when an unchanged email is retried', async () => {
    const original = await attempt(first);
    const retry = await attempt({ ...first, at: '2026-10-04T13:02:00Z' });

    expect(retry.idempotencyKey).toBe(original.idempotencyKey);
    expect(retry.requestKey).toBe(original.requestKey);
  });

  it('uses a new identity when the content changes before a retry', async () => {
    const original = await attempt(first);
    // Tunebox Family was excluded from notifications before the retry.
    const retry = await attempt({ ...first, items: [video], at: '2026-10-04T13:02:00Z' });

    expect(retry.idempotencyKey).not.toBe(original.idempotencyKey);
    expect(retry.requestKey).not.toBe(original.requestKey);
  });

  it('uses a new identity when the account email changes before a retry', async () => {
    const original = await attempt(first);
    const retry = await attempt({ ...first, recipient: 'new-owner@example.com', at: '2026-10-04T13:02:00Z' });

    expect(retry.to).toEqual(['new-owner@example.com']);
    expect(retry.idempotencyKey).not.toBe(original.idempotencyKey);
    expect(retry.requestKey).not.toBe(original.requestKey);
  });
});
