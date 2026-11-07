import { describe, expect, it } from 'vitest';

import { formatInvoiceDistance, formatUpcomingDay } from '@/features/subscriptions/format';

/** Fixed reference point so distances never depend on the wall clock. */
const NOW = new Date(2026, 0, 10);

function distance(isoDate: string): string {
  return formatInvoiceDistance(isoDate, NOW);
}

describe('formatInvoiceDistance', () => {
  it('names the current and adjacent days', () => {
    expect(distance('2026-01-10')).toBe('Today');
    expect(distance('2026-01-11')).toBe('Tomorrow');
    expect(distance('2026-01-09')).toBe('Yesterday');
  });

  it('counts upcoming days', () => {
    expect(distance('2026-01-12')).toBe('in 2 days');
  });

  it('counts elapsed days', () => {
    expect(distance('2026-01-08')).toBe('2 days ago');
  });

  it('uses days through the 60-day boundary', () => {
    expect(distance('2026-03-11')).toBe('in 60 days');
    expect(distance('2025-11-11')).toBe('60 days ago');
  });

  it('switches to months past the 60-day boundary', () => {
    expect(distance('2026-03-12')).toBe('in 2 months');
    expect(distance('2025-11-10')).toBe('2 months ago');
  });

  it('measures whole calendar days, ignoring the time of the reference date', () => {
    expect(formatInvoiceDistance('2026-01-11', new Date(2026, 0, 10, 23, 59, 59))).toBe('Tomorrow');
    expect(formatInvoiceDistance('2026-01-13', new Date(2026, 0, 10, 0, 30))).toBe('in 3 days');
  });
});

describe('formatUpcomingDay', () => {
  // NOW is Saturday, January 10, 2026.
  function day(isoDate: string): string {
    return formatUpcomingDay(isoDate, NOW);
  }

  it('names today and tomorrow', () => {
    expect(day('2026-01-10')).toBe('today');
    expect(day('2026-01-11')).toBe('tomorrow');
  });

  it('names the weekday within the coming week', () => {
    expect(day('2026-01-12')).toBe('on Monday');
    expect(day('2026-01-16')).toBe('on Friday');
  });

  it('switches to a date once the weekday would repeat', () => {
    expect(day('2026-01-17')).toBe('on Jan 17');
    expect(day('2026-02-03')).toBe('on Feb 3');
  });

  it('ignores the time component of the reference date', () => {
    expect(formatUpcomingDay('2026-01-11', new Date(2026, 0, 10, 23, 59))).toBe('tomorrow');
  });
});
