import { describe, expect, it } from 'vitest';

import {
  advanceInvoiceDate,
  compareRecordedInvoices,
  getDefaultSelectedDate,
  getProjectionRange,
  invoicesInRollingWindow,
  projectInvoices,
  toRecordedInvoices,
  type ProjectionInput,
  type RecordedInvoice,
} from '@/features/invoices/domain';

function subscription(overrides: Partial<ProjectionInput> = {}): ProjectionInput {
  return {
    id: 'sub-1',
    name: 'Alpha',
    iconRef: 'alpha.com',
    category: 'Work',
    costAmount: 1000,
    costFrequency: 'monthly',
    nextInvoiceDate: '2026-01-15',
    ...overrides,
  };
}

describe('invoice projection', () => {
  it('generates a separate invoice for every recurrence inside an exclusive range', () => {
    const invoices = projectInvoices([subscription({ costFrequency: 'weekly', nextInvoiceDate: '2026-01-01' })], {
      startDate: '2026-01-08',
      endDate: '2026-01-29',
    });

    expect(invoices.map((invoice) => invoice.date)).toEqual(['2026-01-08', '2026-01-15', '2026-01-22']);
  });

  it('advances stale schedules and preserves chained month-end behavior', () => {
    expect(advanceInvoiceDate('2026-01-31', 'monthly')).toBe('2026-02-28');
    expect(advanceInvoiceDate('2026-02-28', 'monthly')).toBe('2026-03-28');

    const invoices = projectInvoices([subscription({ nextInvoiceDate: '2026-01-01' })], {
      startDate: '2026-03-01',
      endDate: '2026-04-01',
    });

    expect(invoices.map((invoice) => invoice.date)).toEqual(['2026-03-01']);
  });

  it('sorts same-day projections by amount descending then name ascending', () => {
    const invoices = projectInvoices(
      [
        subscription({ id: 'b', name: 'Beta', costAmount: 2000 }),
        subscription({ id: 'a', name: 'Alpha', costAmount: 2000 }),
        subscription({ id: 'c', name: 'Charlie', costAmount: 500 }),
      ],
      { startDate: '2026-01-01', endDate: '2026-02-01' },
    );

    expect(invoices.map((invoice) => invoice.name)).toEqual(['Alpha', 'Beta', 'Charlie']);
  });

  it('uses local date-only boundaries for the 12-month horizon', () => {
    expect(getProjectionRange(new Date(2026, 6, 29, 23, 30))).toEqual({
      startDate: '2026-07-29',
      endDate: '2027-07-01',
    });
  });
});

describe('recorded invoices and aggregation', () => {
  const recorded = toRecordedInvoices([
    {
      id: 'small',
      subscriptionId: null,
      name: 'Archived service',
      iconRef: 'archived.test',
      category: 'Former category',
      amount: 500,
      invoiceDate: '2026-02-10',
    },
    {
      id: 'large',
      subscriptionId: 'sub-2',
      name: 'Current service',
      iconRef: 'current.test',
      category: 'Current category',
      amount: 2500,
      invoiceDate: '2026-02-10',
    },
  ]);

  it('sorts same-day recorded invoices by amount descending', () => {
    expect([...recorded].sort(compareRecordedInvoices).map((invoice) => invoice.id)).toEqual(['large', 'small']);
  });

  it('uses today, the earliest invoice, then the first of the month for selection', () => {
    const now = new Date(2026, 1, 15);

    expect(getDefaultSelectedDate('2026-02', recorded, now)).toBe('2026-02-15');
    const marchInvoice: RecordedInvoice = { ...recorded[0], id: 'march', date: '2026-03-12' };
    expect(getDefaultSelectedDate('2026-03', [marchInvoice], now)).toBe('2026-03-12');
    expect(getDefaultSelectedDate('2026-03', [], now)).toBe('2026-03-01');
  });
});

describe('date ranges', () => {
  it('limits rolling summaries to the configured date window', () => {
    const invoices = projectInvoices([subscription({ costFrequency: 'weekly', nextInvoiceDate: '2026-01-01' })], {
      startDate: '2026-01-01',
      endDate: '2026-03-01',
    });
    const window = invoicesInRollingWindow(invoices, new Date(2026, 0, 1), 14);

    expect(window.map((invoice) => invoice.date)).toEqual(['2026-01-01', '2026-01-08']);
  });
});
