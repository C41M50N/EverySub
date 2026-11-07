import { describe, expect, it } from 'vitest';

import {
  classifyWebhookResult,
  getDestinationHealthUpdate,
  getRetryDelayMs,
  resolveAttempt,
  type SendResult,
} from '@/features/notifications/delivery-policy';
import type { HttpResult } from '@/features/notifications/http';

const response = (status: number, extra: Partial<Extract<HttpResult, { kind: 'response' }>> = {}): HttpResult => ({
  kind: 'response',
  status,
  retryAfterSeconds: null,
  body: '',
  ...extra,
});

describe('classifyWebhookResult', () => {
  it('treats a 2xx as delivered', () => {
    expect(classifyWebhookResult(response(200), 'webhook').outcome).toBe('succeeded');
  });

  it.each([408, 425, 429, 500])('retries %i', (status) => {
    expect(classifyWebhookResult(response(status), 'webhook').outcome).toBe('temporary_failure');
  });

  it.each([301, 400])('treats %i as a permanent rejection', (status) => {
    expect(classifyWebhookResult(response(status), 'webhook').outcome).toBe('permanent_failure');
  });

  it('retries timeouts and network errors', () => {
    expect(classifyWebhookResult({ kind: 'timeout' }, 'webhook').outcome).toBe('temporary_failure');
    expect(classifyWebhookResult({ kind: 'network_error', code: 'ECONNRESET' }, 'discord').outcome).toBe(
      'temporary_failure',
    );
  });

  it('refuses unsafe addresses permanently', () => {
    expect(classifyWebhookResult({ kind: 'unsafe_address' }, 'webhook').outcome).toBe('permanent_failure');
  });

  it('reads Discord’s rate limit hint from the body', () => {
    const result = classifyWebhookResult(response(429, { body: '{"retry_after": 2.5}' }), 'discord');

    expect(result).toMatchObject({ outcome: 'temporary_failure', retryAfterSeconds: 2.5 });
  });

  it('explains a deleted Discord webhook without exposing the URL', () => {
    const result = classifyWebhookResult(response(404, { body: 'secret-ish details' }), 'discord');

    expect(result.outcome).toBe('permanent_failure');
    expect(result.outcome !== 'succeeded' && result.message).toMatch(/Create a new webhook/);
    expect(JSON.stringify(result)).not.toContain('secret-ish');
  });
});

describe('getRetryDelayMs', () => {
  it('allows four retries after the initial attempt, with growing delays', () => {
    const delays = [1, 2, 3, 4].map((attempt) => getRetryDelayMs(attempt, null, () => 0.5));

    expect(delays).toEqual([2, 6, 15, 35].map((minutes) => minutes * 60_000));
    expect(getRetryDelayMs(5, null, () => 0.5)).toBeNull();
  });

  it('spreads retries over roughly an hour with ±20% jitter', () => {
    const total = (random: () => number) =>
      [1, 2, 3, 4].reduce((sum, attempt) => sum + (getRetryDelayMs(attempt, null, random) ?? 0), 0);

    expect(total(() => 0)).toBeCloseTo(0.8 * 58 * 60_000);
    expect(total(() => 1)).toBeCloseTo(1.2 * 58 * 60_000);
  });

  it('honors a longer Retry-After, up to an hour', () => {
    expect(getRetryDelayMs(1, 600, () => 0.5)).toBe(600_000);
    expect(getRetryDelayMs(1, 30, () => 0.5)).toBe(120_000);
    expect(getRetryDelayMs(1, 86_400, () => 0.5)).toBe(3_600_000);
  });
});

describe('resolveAttempt and destination health', () => {
  const now = new Date('2026-10-04T13:00:00Z');
  const temporary: SendResult = {
    outcome: 'temporary_failure',
    message: 'The endpoint returned a temporary error (503).',
  };
  const permanent: SendResult = { outcome: 'permanent_failure', message: 'The endpoint rejected the request (410).' };

  it('retries a temporary failure four times, then gives up after the fifth attempt', () => {
    const resolve = (attemptNumber: number) =>
      resolveAttempt({ attemptNumber, result: temporary, now, random: () => 0.5 });

    expect([1, 2, 3, 4].map(resolve)).toEqual(
      [2, 6, 15, 35].map((minutes) => ({
        status: 'retrying',
        nextAttemptAt: new Date(now.getTime() + minutes * 60_000),
      })),
    );
    expect(resolve(5)).toEqual({ status: 'failed', reason: 'exhausted' });
  });

  it('pauses a destination at once on a permanent rejection', () => {
    const resolution = resolveAttempt({ attemptNumber: 1, result: permanent, now });

    expect(
      getDestinationHealthUpdate({ consecutiveFailedEvents: 0, resolution, result: permanent, now }),
    ).toMatchObject({
      pausedAt: now,
      pauseReason: 'rejected',
      pauseMessage: permanent.message,
    });
  });

  it('doesn’t count a failure that will be retried', () => {
    const resolution = resolveAttempt({ attemptNumber: 2, result: temporary, now });
    const update = getDestinationHealthUpdate({ consecutiveFailedEvents: 2, resolution, result: temporary, now });

    expect(update).toEqual({ lastFailureAt: now, lastFailureMessage: temporary.message });
  });

  it('pauses only when a third event in a row exhausts its retries', () => {
    const resolution = resolveAttempt({ attemptNumber: 5, result: temporary, now });
    const afterEvent = (consecutiveFailedEvents: number) =>
      getDestinationHealthUpdate({ consecutiveFailedEvents, resolution, result: temporary, now });
    const failure = { lastFailureAt: now, lastFailureMessage: temporary.message };

    expect(resolution).toEqual({ status: 'failed', reason: 'exhausted' });
    expect(afterEvent(0)).toEqual({ ...failure, consecutiveFailedEvents: 1 });
    expect(afterEvent(1)).toEqual({ ...failure, consecutiveFailedEvents: 2 });
    expect(afterEvent(2)).toEqual({
      ...failure,
      consecutiveFailedEvents: 3,
      pausedAt: now,
      pauseReason: 'failing',
      pauseMessage: expect.stringContaining(temporary.message),
    });
  });

  it('resets the failure count after a success', () => {
    const result: SendResult = { outcome: 'succeeded' };
    const resolution = resolveAttempt({ attemptNumber: 1, result, now });

    expect(getDestinationHealthUpdate({ consecutiveFailedEvents: 2, resolution, result, now })).toEqual({
      consecutiveFailedEvents: 0,
      lastSuccessAt: now,
    });
  });
});
