import { describe, expect, it } from 'vitest';

import { buildDueInvoiceSchedule, getNextInvoiceDateOnOrAfter } from '@/jobs/invoice-schedule';

describe('buildDueInvoiceSchedule', () => {
  it.each([
    ['weekly', '2026-07-21', '2026-07-28', ['2026-07-21', '2026-07-28'], '2026-08-04'],
    ['monthly', '2026-05-28', '2026-07-28', ['2026-05-28', '2026-06-28', '2026-07-28'], '2026-08-28'],
    ['yearly', '2025-07-28', '2026-07-28', ['2025-07-28', '2026-07-28'], '2027-07-28'],
    ['biennially', '2024-07-28', '2026-07-28', ['2024-07-28', '2026-07-28'], '2028-07-28'],
  ] as const)(
    'catches a %s subscription up through the processing date',
    (frequency, nextInvoiceDate, processingDate, invoiceDates, advancedDate) => {
      expect(buildDueInvoiceSchedule(nextInvoiceDate, frequency, processingDate)).toEqual({
        invoiceDates,
        nextInvoiceDate: advancedDate,
      });
    },
  );

  it('returns no invoices when the next invoice is in the future', () => {
    expect(buildDueInvoiceSchedule('2026-07-29', 'monthly', '2026-07-28')).toEqual({
      invoiceDates: [],
      nextInvoiceDate: '2026-07-29',
    });
  });

  it('uses calendar month arithmetic at the end of a month', () => {
    expect(buildDueInvoiceSchedule('2026-01-31', 'monthly', '2026-03-28')).toEqual({
      invoiceDates: ['2026-01-31', '2026-02-28', '2026-03-28'],
      nextInvoiceDate: '2026-04-28',
    });
  });
});

describe('getNextInvoiceDateOnOrAfter', () => {
  it.each([
    ['monthly', '2026-01-31', '2026-03-01', '2026-03-28'],
    ['biennially', '2024-07-28', '2026-07-28', '2026-07-28'],
  ] as const)(
    'advances a %s schedule without creating missed invoices',
    (frequency, nextDate, earliestDate, expected) => {
      expect(getNextInvoiceDateOnOrAfter(nextDate, frequency, earliestDate)).toBe(expected);
    },
  );

  it('keeps a future scheduled date unchanged', () => {
    expect(getNextInvoiceDateOnOrAfter('2026-08-15', 'monthly', '2026-07-28')).toBe('2026-08-15');
  });
});
