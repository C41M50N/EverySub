import { describe, expect, it } from 'vitest';

import {
  buildMonthlyBreakdown,
  buildUpcomingWindow,
  effectiveMonthlyCents,
  effectiveYearlyCents,
  findNextInvoice,
  formatCentsForInput,
  normalizeCostInput,
  parseCostToCents,
  sanitizeCostInput,
  type CostInput,
} from '@/features/subscriptions/cost';

function sub(overrides: Partial<CostInput>): CostInput {
  return {
    costAmount: 1000,
    costFrequency: 'monthly',
    nextInvoiceDate: '2026-01-15',
    ...overrides,
  };
}

describe('effective cost', () => {
  it('normalizes each cadence to monthly and yearly cents', () => {
    expect(effectiveMonthlyCents(sub({ costAmount: 1599, costFrequency: 'monthly' }))).toBe(1599);
    expect(effectiveMonthlyCents(sub({ costAmount: 1200, costFrequency: 'weekly' }))).toBe(5200);
    expect(effectiveMonthlyCents(sub({ costAmount: 12000, costFrequency: 'yearly' }))).toBe(1000);
    expect(effectiveMonthlyCents(sub({ costAmount: 24000, costFrequency: 'biennially' }))).toBe(1000);

    expect(effectiveYearlyCents(sub({ costAmount: 1000, costFrequency: 'monthly' }))).toBe(12000);
    expect(effectiveYearlyCents(sub({ costAmount: 500, costFrequency: 'weekly' }))).toBe(26000);
    expect(effectiveYearlyCents(sub({ costAmount: 9900, costFrequency: 'yearly' }))).toBe(9900);
    expect(effectiveYearlyCents(sub({ costAmount: 20000, costFrequency: 'biennially' }))).toBe(10000);
  });
});

describe('findNextInvoice', () => {
  it('picks the earliest date, surfacing an overdue one rather than rolling it forward', () => {
    const overdue = sub({ nextInvoiceDate: '2020-01-01' });

    expect(findNextInvoice([sub({ nextInvoiceDate: '2026-02-01' }), overdue])).toBe(overdue);
  });

  it('breaks a same-day tie on the larger amount', () => {
    const small = sub({ costAmount: 500, nextInvoiceDate: '2026-02-01' });
    const large = sub({ costAmount: 9900, nextInvoiceDate: '2026-02-01' });

    expect(findNextInvoice([small, large])).toBe(large);
  });
});

describe('buildUpcomingWindow', () => {
  const from = new Date(2026, 0, 10); // Jan 10, 2026

  it('includes the window start day and excludes the end day', () => {
    const onStart = buildUpcomingWindow([sub({ nextInvoiceDate: '2026-01-10' })], from, 30);
    const onEnd = buildUpcomingWindow([sub({ nextInvoiceDate: '2026-02-09' })], from, 30);

    expect(onStart.invoiceCount).toBe(1);
    expect(onEnd.invoiceCount).toBe(0);
  });

  it('bills the full amount of a yearly plan renewing inside the window', () => {
    // The whole point of the metric: effective cost would smooth this to 5000/mo.
    const window = buildUpcomingWindow(
      [sub({ costAmount: 60000, costFrequency: 'yearly', nextInvoiceDate: '2026-01-15' })],
      from,
      30,
    );

    expect(window.totalCents).toBe(60000);
  });

  it('collapses repeat weekly charges into one entry with an occurrence count', () => {
    const window = buildUpcomingWindow(
      [sub({ costAmount: 100, costFrequency: 'weekly', nextInvoiceDate: '2026-01-12' })],
      from,
      30,
    );

    // Jan 12, 19, 26 and Feb 2 all land before Feb 9.
    expect(window.charges).toHaveLength(1);
    expect(window.charges[0].occurrences).toBe(4);
    expect(window.charges[0].totalCents).toBe(400);
    expect(window.invoiceCount).toBe(4);
  });

  it('rolls an overdue date forward instead of counting it as due now', () => {
    const window = buildUpcomingWindow(
      [sub({ costAmount: 500, costFrequency: 'monthly', nextInvoiceDate: '2025-06-15' })],
      from,
      30,
    );

    expect(window.charges[0].date).toEqual(new Date(2026, 0, 15));
    expect(window.invoiceCount).toBe(1);
  });

  it('orders charges soonest first', () => {
    const later = sub({ nextInvoiceDate: '2026-02-01' });
    const sooner = sub({ nextInvoiceDate: '2026-01-11' });

    const window = buildUpcomingWindow([later, sooner], from, 30);

    expect(window.charges.map((charge) => charge.item)).toEqual([sooner, later]);
  });
});

describe('buildMonthlyBreakdown', () => {
  const from = new Date(2026, 0, 10); // Jan 10, 2026

  it('produces the requested number of consecutive month buckets', () => {
    const entries = buildMonthlyBreakdown([], from, 12);

    expect(entries).toHaveLength(12);
    expect(entries[0].monthKey).toBe('2026-01');
    expect(entries[0].label).toBe('Jan 2026');
    expect(entries[11].monthKey).toBe('2026-12');
    expect(entries.every((entry) => entry.totalCents === 0)).toBe(true);
  });

  it('buckets a monthly subscription into every month', () => {
    const entries = buildMonthlyBreakdown(
      [sub({ costAmount: 1500, costFrequency: 'monthly', nextInvoiceDate: '2026-01-20' })],
      from,
      12,
    );

    expect(entries.every((entry) => entry.totalCents === 1500)).toBe(true);
  });

  it('buckets a yearly subscription into only its billed month', () => {
    const entries = buildMonthlyBreakdown(
      [sub({ costAmount: 9900, costFrequency: 'yearly', nextInvoiceDate: '2026-03-05' })],
      from,
      12,
    );

    expect(entries.find((entry) => entry.monthKey === '2026-03')?.totalCents).toBe(9900);
    expect(entries.filter((entry) => entry.totalCents > 0)).toHaveLength(1);
  });

  it('rolls a past invoice date forward to the window', () => {
    const entries = buildMonthlyBreakdown(
      [sub({ costAmount: 500, costFrequency: 'monthly', nextInvoiceDate: '2025-06-15' })],
      from,
      3,
    );

    expect(entries.map((entry) => entry.totalCents)).toEqual([500, 500, 500]);
  });

  it('bills a weekly subscription multiple times within a month', () => {
    const entries = buildMonthlyBreakdown(
      [sub({ costAmount: 100, costFrequency: 'weekly', nextInvoiceDate: '2026-01-01' })],
      from,
      1,
    );

    // Jan 1, 8, 15, 22, 29 all land in January 2026.
    expect(entries[0].totalCents).toBe(500);
  });
});

describe('sanitizeCostInput', () => {
  it('filters typed or pasted input down to a decimal amount', () => {
    // Grouping commas would otherwise make parseFloat truncate $1,299 to $1.
    expect(sanitizeCostInput('1,299.00')).toBe('1299.00');
    expect(sanitizeCostInput('$9.99')).toBe('9.99');
    expect(sanitizeCostInput('9.999')).toBe('9.99');
    expect(sanitizeCostInput('-5')).toBe('5');
    expect(sanitizeCostInput('1.2.3')).toBe('1.23');
    expect(sanitizeCostInput('abc')).toBe('');
    // A trailing dot survives mid-typing.
    expect(sanitizeCostInput('12.')).toBe('12.');
  });
});

describe('parseCostToCents', () => {
  it('converts to integer cents without float drift', () => {
    expect(parseCostToCents('19.99')).toBe(1999);
    expect(parseCostToCents('0')).toBe(0);
  });

  it('rejects unusable amounts', () => {
    expect(parseCostToCents('   ')).toBeNull();
    expect(parseCostToCents('.')).toBeNull();
    // parseFloat would accept this as 9.9.
    expect(parseCostToCents('9.9abc')).toBeNull();
    expect(parseCostToCents('-5')).toBeNull();
  });
});

describe('formatCentsForInput', () => {
  it('round-trips through parseCostToCents', () => {
    expect(parseCostToCents(formatCentsForInput(1599))).toBe(1599);
  });
});

describe('normalizeCostInput', () => {
  it('pads a parseable amount on blur and leaves unparseable input for the user to fix', () => {
    expect(normalizeCostInput('9.9')).toBe('9.90');
    expect(normalizeCostInput('.')).toBe('.');
  });
});
