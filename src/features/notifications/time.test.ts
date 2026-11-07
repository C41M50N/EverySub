import { describe, expect, it } from 'vitest';

import {
  addDaysToDateKey,
  addMonthsToMonthKey,
  getDueOverviewPeriod,
  getDueReminderSlot,
  getOverviewPeriod,
  getSendTime,
  isOverviewSendable,
  normalizeTimeZone,
  toLocalDateKey,
} from '@/features/notifications/time';

const utc = (iso: string) => new Date(iso);

describe('date keys', () => {
  it.each([
    ['2026-01-31', 1, '2026-02-01'],
    ['2026-02-28', 1, '2026-03-01'],
    ['2028-02-28', 1, '2028-02-29'],
    ['2026-12-31', 1, '2027-01-01'],
    ['2026-03-01', -1, '2026-02-28'],
  ])('adds days to %s (%i)', (date, days, expected) => {
    expect(addDaysToDateKey(date, days)).toBe(expected);
  });

  it.each([
    ['2026-01', -1, '2025-12'],
    ['2026-12', 1, '2027-01'],
  ])('adds months to %s (%i)', (month, months, expected) => {
    expect(addMonthsToMonthKey(month, months)).toBe(expected);
  });
});

describe('toLocalDateKey', () => {
  it('reads the calendar date in the user’s time zone, not UTC', () => {
    const instant = utc('2026-10-04T03:00:00Z');

    expect(toLocalDateKey(instant, 'UTC')).toBe('2026-10-04');
    expect(toLocalDateKey(instant, 'America/New_York')).toBe('2026-10-03');
    expect(toLocalDateKey(instant, 'Pacific/Kiritimati')).toBe('2026-10-04');
    expect(toLocalDateKey(utc('2026-10-04T10:30:00Z'), 'Pacific/Kiritimati')).toBe('2026-10-05');
  });
});

describe('getSendTime', () => {
  it.each([
    // US daylight saving starts March 8 and ends November 1, 2026.
    ['America/New_York', '2026-03-07', '2026-03-07T14:00:00.000Z'],
    ['America/New_York', '2026-03-08', '2026-03-08T13:00:00.000Z'],
    ['America/New_York', '2026-10-31', '2026-10-31T13:00:00.000Z'],
    ['America/New_York', '2026-11-01', '2026-11-01T14:00:00.000Z'],
    // European daylight saving ends October 25, 2026.
    ['Europe/Berlin', '2026-10-24', '2026-10-24T07:00:00.000Z'],
    ['Europe/Berlin', '2026-10-25', '2026-10-25T08:00:00.000Z'],
    // Time zones offset by a fraction of an hour.
    ['Asia/Kolkata', '2026-10-04', '2026-10-04T03:30:00.000Z'],
    ['Asia/Kathmandu', '2026-10-04', '2026-10-04T03:15:00.000Z'],
    ['Pacific/Chatham', '2026-10-04', '2026-10-03T19:15:00.000Z'],
    ['Australia/Lord_Howe', '2026-07-01', '2026-06-30T22:30:00.000Z'],
  ])('is 9 a.m. local in %s on %s', (timeZone, date, expected) => {
    expect(getSendTime(date, timeZone).toISOString()).toBe(expected);
  });

  it('keeps the local date across a daylight saving change', () => {
    for (const date of ['2026-03-08', '2026-11-01']) {
      expect(toLocalDateKey(getSendTime(date, 'America/New_York'), 'America/New_York')).toBe(date);
    }
  });
});

describe('getDueReminderSlot', () => {
  it('uses yesterday’s send until 9 a.m. local, then today’s', () => {
    expect(getDueReminderSlot(utc('2026-10-04T12:59:59Z'), 'America/New_York').date).toBe('2026-10-03');
    expect(getDueReminderSlot(utc('2026-10-04T13:00:00Z'), 'America/New_York')).toEqual({
      date: '2026-10-04',
      scheduledFor: utc('2026-10-04T13:00:00Z'),
    });
  });

  it('reaches 9 a.m. in a time zone 45 minutes off the hour', () => {
    expect(getDueReminderSlot(utc('2026-10-04T03:14:00Z'), 'Asia/Kathmandu').date).toBe('2026-10-03');
    expect(getDueReminderSlot(utc('2026-10-04T03:15:00Z'), 'Asia/Kathmandu').date).toBe('2026-10-04');
  });

  it('handles the day daylight saving starts', () => {
    expect(getDueReminderSlot(utc('2026-03-08T12:59:00Z'), 'America/New_York').date).toBe('2026-03-07');
    expect(getDueReminderSlot(utc('2026-03-08T13:00:00Z'), 'America/New_York').date).toBe('2026-03-08');
  });
});

describe('monthly overview periods', () => {
  it('covers the complete previous month and the new month', () => {
    expect(getOverviewPeriod('2026-03', 'America/New_York')).toEqual({
      month: '2026-03',
      previousMonth: '2026-02',
      scheduledFor: utc('2026-03-01T14:00:00Z'),
      startDate: '2026-03-01',
      endDate: '2026-04-01',
      previousStartDate: '2026-02-01',
      previousEndDate: '2026-03-01',
    });
  });

  it('opens at 9 a.m. on the first local day and closes after day 7', () => {
    const timeZone = 'America/New_York';

    expect(getDueOverviewPeriod(utc('2026-10-01T12:59:00Z'), timeZone)).toBeNull();
    expect(getDueOverviewPeriod(utc('2026-10-01T13:00:00Z'), timeZone)?.month).toBe('2026-10');
    expect(getDueOverviewPeriod(utc('2026-10-08T03:59:00Z'), timeZone)?.month).toBe('2026-10');
    expect(getDueOverviewPeriod(utc('2026-10-08T04:00:00Z'), timeZone)).toBeNull();
  });

  it('uses the local month, not the UTC month', () => {
    // Already October 1 in UTC, but still September 30 in New York.
    expect(getDueOverviewPeriod(utc('2026-10-01T02:00:00Z'), 'America/New_York')).toBeNull();
    // Already October 1 at 9:15 a.m. in Chatham while UTC is still September 30.
    expect(getDueOverviewPeriod(utc('2026-09-30T19:30:00Z'), 'Pacific/Chatham')?.month).toBe('2026-10');
  });

  it('stops a retry from sending a stale overview', () => {
    expect(isOverviewSendable('2026-10', utc('2026-10-07T20:00:00Z'), 'America/New_York')).toBe(true);
    expect(isOverviewSendable('2026-10', utc('2026-10-09T12:00:00Z'), 'America/New_York')).toBe(false);
    expect(isOverviewSendable('2026-09', utc('2026-10-02T12:00:00Z'), 'America/New_York')).toBe(false);
  });
});

describe('normalizeTimeZone', () => {
  it('accepts IANA names and rejects anything else', () => {
    expect(normalizeTimeZone('America/New_York')).toBe('America/New_York');
    // Runtimes may canonicalize to an alias, so only acceptance is checked.
    expect(normalizeTimeZone('America/Argentina/Buenos_Aires')).toMatch(/Buenos_Aires$/);
    expect(normalizeTimeZone('Etc/GMT+5')).toBe('Etc/GMT+5');
    expect(normalizeTimeZone('UTC')).toBe('UTC');
    expect(normalizeTimeZone('Not/AZone')).toBeNull();
    expect(normalizeTimeZone('')).toBeNull();
    // Accepted by Intl, but not IANA names and without daylight saving rules.
    expect(normalizeTimeZone('EST')).toBeNull();
    expect(normalizeTimeZone('+05:00')).toBeNull();
  });
});
