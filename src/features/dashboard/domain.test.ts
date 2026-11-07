import { describe, expect, it } from 'vitest';

import {
  buildCategoryBreakdown,
  buildSpendTrend,
  foldCategoryShares,
  getRecordedTrendRange,
} from '@/features/dashboard/domain';
import type { ProjectedInvoice, RecordedInvoice } from '@/features/invoices/domain';

const now = new Date(2026, 8, 4); // 2026-09-04, local time

function recorded(overrides: Partial<RecordedInvoice> = {}): RecordedInvoice {
  return {
    kind: 'recorded',
    id: 'inv-1',
    subscriptionId: 'sub-1',
    name: 'Alpha',
    iconRef: 'alpha.com',
    category: 'Work',
    amount: 1000,
    date: '2026-09-01',
    ...overrides,
  };
}

function projected(overrides: Partial<ProjectedInvoice> = {}): ProjectedInvoice {
  return {
    kind: 'upcoming',
    id: 'sub-1:2026-09-15',
    subscriptionId: 'sub-1',
    name: 'Alpha',
    iconRef: 'alpha.com',
    category: 'Work',
    amount: 1000,
    frequency: 'monthly',
    date: '2026-09-15',
    ...overrides,
  };
}

describe('getRecordedTrendRange', () => {
  it('spans six past months through the end of the current month', () => {
    expect(getRecordedTrendRange(now)).toEqual({ startDate: '2026-03-01', endDate: '2026-10-01' });
  });
});

describe('buildSpendTrend', () => {
  it('emits one zero-filled point per month, marking past, current, and future', () => {
    const points = buildSpendTrend([], [], now);

    expect(points).toHaveLength(13);
    expect(points[0]).toMatchObject({ monthKey: '2026-03', status: 'past' });
    expect(points[5]).toMatchObject({ monthKey: '2026-08', status: 'past' });
    expect(points[6]).toMatchObject({ monthKey: '2026-09', status: 'current' });
    expect(points[7]).toMatchObject({ monthKey: '2026-10', status: 'future' });
    expect(points[12]).toMatchObject({ monthKey: '2027-03', status: 'future' });
    expect(points.every((point) => point.recordedCents === 0 && point.projectedCents === 0)).toBe(true);
  });

  it('labels the first bar and January with a year', () => {
    const labels = buildSpendTrend([], [], now).map((point) => point.label);

    expect(labels[0]).toBe('Mar ’26');
    expect(labels[1]).toBe('Apr');
    expect(labels[10]).toBe('Jan ’27');
    expect(labels[12]).toBe('Mar');
  });

  it('buckets recorded and projected invoices into their months', () => {
    const points = buildSpendTrend(
      [recorded({ id: 'a', date: '2026-07-10', amount: 500 }), recorded({ id: 'b', date: '2026-07-20', amount: 250 })],
      [projected({ id: 'c', date: '2026-11-03', amount: 900 })],
      now,
    );

    expect(points.find((point) => point.monthKey === '2026-07')).toMatchObject({
      recordedCents: 750,
      projectedCents: 0,
    });
    expect(points.find((point) => point.monthKey === '2026-11')).toMatchObject({
      recordedCents: 0,
      projectedCents: 900,
    });
  });

  it('splits the current month between recorded-to-date and projected remainder', () => {
    const points = buildSpendTrend(
      [recorded({ date: '2026-09-01', amount: 1200 })],
      [projected({ date: '2026-09-20', amount: 800 })],
      now,
    );

    expect(points[6]).toMatchObject({ monthKey: '2026-09', recordedCents: 1200, projectedCents: 800 });
  });

  it('ignores invoices outside the window and stale projections in the past', () => {
    const points = buildSpendTrend(
      [recorded({ date: '2026-02-28', amount: 100 })],
      [
        projected({ id: 'stale', date: '2026-08-15', amount: 100 }),
        projected({ id: 'far', date: '2027-04-01', amount: 100 }),
      ],
      now,
    );

    expect(points.every((point) => point.recordedCents === 0 && point.projectedCents === 0)).toBe(true);
  });
});

describe('buildCategoryBreakdown', () => {
  it('groups by category, ranks by monthly cost, and computes shares', () => {
    const breakdown = buildCategoryBreakdown([
      { category: 'Streaming', costAmount: 1000, costFrequency: 'monthly', nextInvoiceDate: '2026-09-10' },
      { category: 'Streaming', costAmount: 12000, costFrequency: 'yearly', nextInvoiceDate: '2026-09-10' },
      { category: 'Work', costAmount: 3000, costFrequency: 'monthly', nextInvoiceDate: '2026-09-10' },
    ]);

    expect(breakdown).toEqual([
      { category: 'Work', monthlyCents: 3000, count: 1, share: 0.6 },
      { category: 'Streaming', monthlyCents: 2000, count: 2, share: 0.4 },
    ]);
  });

  it('labels missing categories and breaks cost ties by name', () => {
    const breakdown = buildCategoryBreakdown([
      { category: null, costAmount: 500, costFrequency: 'monthly', nextInvoiceDate: '2026-09-10' },
      { category: 'Music', costAmount: 500, costFrequency: 'monthly', nextInvoiceDate: '2026-09-10' },
    ]);

    expect(breakdown.map((entry) => entry.category)).toEqual(['Music', 'Uncategorized']);
  });

  it('returns zero shares when nothing costs anything', () => {
    const breakdown = buildCategoryBreakdown([
      { category: 'Free', costAmount: 0, costFrequency: 'monthly', nextInvoiceDate: '2026-09-10' },
    ]);

    expect(breakdown[0].share).toBe(0);
  });
});

describe('foldCategoryShares', () => {
  const share = (category: string, monthlyCents: number, total: number, count = 1) => ({
    category,
    monthlyCents,
    count,
    share: total > 0 ? monthlyCents / total : 0,
  });

  it('keeps everything and assigns slots by rank when under the cap and minimum', () => {
    const slices = foldCategoryShares([share('A', 600, 1000), share('B', 400, 1000)]);

    expect(slices).toEqual([
      { kind: 'category', slot: 1, category: 'A', monthlyCents: 600, count: 1, share: 0.6 },
      { kind: 'category', slot: 2, category: 'B', monthlyCents: 400, count: 1, share: 0.4 },
    ]);
  });

  it('folds slivers under the minimum share into Other regardless of count', () => {
    const slices = foldCategoryShares([share('A', 975, 1000), share('B', 15, 1000, 2), share('C', 10, 1000)]);

    expect(slices.map((slice) => slice.category)).toEqual(['A', 'Other']);
    expect(slices[1]).toMatchObject({
      kind: 'other',
      monthlyCents: 25,
      count: 3,
      share: 0.025,
      folded: [share('B', 15, 1000, 2), share('C', 10, 1000)],
    });
  });

  it('turns the last slot into Other when the cap is exceeded, keeping the fold ranked', () => {
    const entries = [
      share('A', 50, 100),
      share('B', 20, 100),
      share('C', 15, 100),
      share('D', 10, 100),
      share('E', 5, 100),
    ];
    const slices = foldCategoryShares(entries, { maxSlices: 3, minShare: 0 });

    expect(slices.map((slice) => slice.category)).toEqual(['A', 'B', 'Other']);
    expect(slices[2]).toMatchObject({ kind: 'other', monthlyCents: 30, share: 0.3 });
    expect(
      (slices[2] as { folded: unknown[] }).folded.map((entry) => (entry as { category: string }).category),
    ).toEqual(['C', 'D', 'E']);
  });

  it('counts the Other slice against the cap when slivers already forced one', () => {
    const entries = [share('A', 40, 100), share('B', 30, 100), share('C', 29, 100), share('D', 1, 100)];
    const slices = foldCategoryShares(entries, { maxSlices: 3, minShare: 0.02 });

    expect(slices.map((slice) => slice.category)).toEqual(['A', 'B', 'Other']);
    expect(slices[2]).toMatchObject({ monthlyCents: 30, count: 2 });
  });

  it('does not fold anything when exactly at the cap', () => {
    const entries = [share('A', 50, 100), share('B', 30, 100), share('C', 20, 100)];

    expect(foldCategoryShares(entries, { maxSlices: 3 }).map((slice) => slice.category)).toEqual(['A', 'B', 'C']);
  });

  it('ignores the minimum share when nothing costs anything', () => {
    const slices = foldCategoryShares([share('Free', 0, 0), share('Also free', 0, 0)]);

    expect(slices.map((slice) => slice.category)).toEqual(['Free', 'Also free']);
  });
});
