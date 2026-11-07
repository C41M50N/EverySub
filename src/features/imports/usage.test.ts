import { describe, expect, it } from 'vitest';

import {
  evaluateSmartImportUsage,
  formatWaitTime,
  getSmartImportUsageMessage,
  hasRunInProgress,
  type UsageRun,
} from '@/features/imports/usage';
import type { AiUsageStatus } from '@/lib/db/ai-usage-schema';

const now = new Date('2026-09-26T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;

function runs(status: AiUsageStatus, hoursAgo: number[]): UsageRun[] {
  return hoursAgo.map((hours) => ({ status, createdAt: new Date(now.getTime() - hours * HOUR) }));
}

describe('evaluateSmartImportUsage', () => {
  it('counts remaining successful runs', () => {
    expect(evaluateSmartImportUsage([], now)).toEqual({ status: 'available', successesRemaining: 5 });
    expect(evaluateSmartImportUsage(runs('succeeded', [1, 2, 3]), now)).toEqual({
      status: 'available',
      successesRemaining: 2,
    });
  });

  it('only counts successes toward the success limit', () => {
    const history = [
      ...runs('succeeded', [1]),
      ...runs('failed', [2, 3]),
      ...runs('cancelled', [4]),
      ...runs('started', [5]),
    ];

    expect(evaluateSmartImportUsage(history, now)).toEqual({ status: 'available', successesRemaining: 4 });
  });

  it('ignores runs older than 24 hours', () => {
    expect(evaluateSmartImportUsage(runs('succeeded', [24, 30, 48, 1, 2]), now)).toEqual({
      status: 'available',
      successesRemaining: 3,
    });
  });

  it('blocks after 5 successes until the oldest one leaves the window', () => {
    expect(evaluateSmartImportUsage(runs('succeeded', [21, 10, 8, 4, 1]), now)).toEqual({
      status: 'success_limit',
      availableAt: new Date(now.getTime() + 3 * HOUR),
    });
  });

  it('uses the run that keeps the count at the limit when over it', () => {
    // Six successes: the limit clears when the second oldest leaves the window.
    expect(evaluateSmartImportUsage(runs('succeeded', [22, 20, 10, 8, 4, 1]), now)).toEqual({
      status: 'success_limit',
      availableAt: new Date(now.getTime() + 4 * HOUR),
    });
  });

  it('blocks after 15 attempts of any status, including crashed runs', () => {
    const history = [
      ...runs('failed', [23, 22, 21, 20, 19]),
      ...runs('cancelled', [18, 17, 16, 15, 14]),
      ...runs('started', [13, 12, 11]),
      ...runs('succeeded', [10, 9]),
    ];

    expect(evaluateSmartImportUsage(history, now)).toEqual({
      status: 'attempt_limit',
      availableAt: new Date(now.getTime() + 1 * HOUR),
    });
  });

  it('reports whichever limit clears later when both are reached', () => {
    const history = [
      ...runs('succeeded', [22, 21, 20, 19, 2]),
      ...runs('failed', [23, 18, 17, 16, 15, 14, 13, 12, 11, 10]),
    ];

    expect(evaluateSmartImportUsage(history, now)).toEqual({
      status: 'success_limit',
      availableAt: new Date(now.getTime() + 2 * HOUR),
    });
  });
});

describe('hasRunInProgress', () => {
  it('treats a recent started run as in progress', () => {
    expect(hasRunInProgress(runs('started', [0.05]), now)).toBe(true);
  });

  it('ignores finished runs and runs abandoned by a crash', () => {
    expect(hasRunInProgress([...runs('succeeded', [0.01]), ...runs('failed', [0.02])], now)).toBe(false);
    expect(hasRunInProgress(runs('started', [0.2]), now)).toBe(false);
  });
});

describe('getSmartImportUsageMessage', () => {
  it('says nothing until 2 or fewer successes remain', () => {
    expect(getSmartImportUsageMessage({ status: 'available', successesRemaining: 3 }, now)).toBeNull();
    expect(getSmartImportUsageMessage({ status: 'available', successesRemaining: null }, now)).toBeNull();
    expect(getSmartImportUsageMessage({ status: 'available', successesRemaining: 2 }, now)).toBe(
      '2 smart imports left today',
    );
    expect(getSmartImportUsageMessage({ status: 'available', successesRemaining: 1 }, now)).toBe(
      '1 smart import left today',
    );
  });
});

describe('formatWaitTime', () => {
  it('rounds up to minutes under an hour and hours after that', () => {
    expect(formatWaitTime(new Date(now.getTime() + 20_000), now)).toBe('1m');
    expect(formatWaitTime(new Date(now.getTime() + 45 * 60_000), now)).toBe('45m');
    expect(formatWaitTime(new Date(now.getTime() + HOUR), now)).toBe('1h');
    expect(formatWaitTime(new Date(now.getTime() + HOUR + 60_000), now)).toBe('2h');
  });
});
