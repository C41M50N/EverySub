import { describe, expect, it } from 'vitest';

import {
  candidatesFromExport,
  draftFromExportValues,
  type ImportCandidate,
  type SubscriptionDraft,
} from '@/features/imports/candidates';
import {
  addPendingCategory,
  applyRowEdit,
  buildDuplicateIndex,
  createReviewState,
  getSelectedItems,
  groupReviewRows,
  isLikelyDuplicate,
  type ReviewContext,
  setRowsSelected,
  summarizeSelection,
} from '@/features/imports/review';
import type { ImportSubscriptionItem } from '@/features/subscriptions/schema';

const draft = (overrides: Partial<SubscriptionDraft> = {}): SubscriptionDraft => ({
  name: 'Netflix',
  iconRef: 'netflix.com',
  category: 'Streaming',
  costAmount: 1549,
  costFrequency: 'monthly',
  nextInvoiceDate: '2026-10-12',
  status: 'active',
  deactivatedAt: null,
  ...overrides,
});

const candidate = (overrides: Partial<ImportCandidate> = {}): ImportCandidate => ({
  group: 'ready',
  draft: draft(),
  error: null,
  reason: null,
  descriptor: null,
  ...overrides,
});

const context: ReviewContext = {
  subscriptions: [
    { name: 'Spotify', iconRef: 'spotify.com' },
    { name: 'Old Gym', iconRef: 'gym.example' },
  ],
  categories: ['Streaming', 'Music'],
};

describe('createReviewState', () => {
  it('selects Ready rows and leaves the other groups cleared', () => {
    const state = createReviewState(
      [
        candidate({ draft: draft({ name: 'Netflix', iconRef: 'netflix.com' }) }),
        candidate({ group: 'needs_review', draft: draft({ name: 'Hulu', iconRef: 'hulu.com' }) }),
        candidate({ group: 'needs_fixes', draft: draft({ name: 'Mystery', iconRef: '' }), error: 'Pick an icon' }),
      ],
      context,
    );

    expect(state.rows.map((row) => row.group)).toEqual(['ready', 'needs_review', 'needs_fixes']);
    expect([...state.selectedIds]).toEqual(['row-0']);
    expect(state.touched).toBe(false);
  });

  it('starts likely duplicates cleared, even in Ready', () => {
    const state = createReviewState(
      [
        candidate({ draft: draft({ name: 'spotify ', iconRef: 'open.spotify.com' }) }),
        candidate({ draft: draft({ name: 'Gym Membership', iconRef: 'GYM.example' }) }),
      ],
      context,
    );

    expect(state.rows.map((row) => row.group)).toEqual(['ready', 'ready']);
    expect(state.selectedIds.size).toBe(0);
  });

  it('moves rows whose values do not validate into Needs fixes', () => {
    const state = createReviewState([candidate({ draft: draft({ costAmount: null }) })], context);

    expect(state.rows[0]).toMatchObject({ group: 'needs_fixes', error: 'Cost is required' });
    expect(state.selectedIds.size).toBe(0);
  });

  it('collects category names that do not exist yet as pending', () => {
    const state = createReviewState(
      [
        candidate({ draft: draft({ category: 'Fitness' }) }),
        candidate({ draft: draft({ name: 'Peloton', category: 'fitness' }) }),
        candidate({ draft: draft({ name: 'Hulu', category: 'streaming' }) }),
        candidate({ draft: draft({ name: 'Other', category: null }) }),
      ],
      context,
    );

    expect(state.pendingCategories).toEqual(['Fitness']);
  });

  it('builds file import rows in Ready and Needs fixes only', () => {
    const state = createReviewState(
      candidatesFromExport({
        rows: [
          {
            name: 'Netflix',
            status: 'inactive',
            category: null,
            iconRef: 'netflix.com',
            costAmountCents: 1549,
            costFrequency: 'monthly',
            nextInvoiceDate: '2026-10-12',
            deactivatedAt: '2026-09-01T00:00:00.000Z',
          },
        ],
        invalidRows: [
          { values: { name: 'Broken', costAmountCents: 'abc', costFrequency: 'daily' }, error: 'Enter a valid cost' },
        ],
      }),
      { subscriptions: [], categories: [] },
    );

    expect(groupReviewRows(state.rows).map((section) => section.group)).toEqual(['ready', 'needs_fixes']);
    expect(state.rows[0]?.draft).toMatchObject({ status: 'inactive', deactivatedAt: '2026-09-01T00:00:00.000Z' });
    expect(state.rows[1]).toMatchObject({ error: 'Enter a valid cost' });
  });
});

describe('draftFromExportValues', () => {
  it('leaves an empty cost empty instead of zero', () => {
    expect(draftFromExportValues({ costAmountCents: '' }).costAmount).toBeNull();
  });

  it('keeps usable values and empties the rest', () => {
    expect(
      draftFromExportValues({
        name: ' Broken ',
        status: 'paused',
        category: '',
        iconRef: 'broken.example',
        costAmountCents: '1299',
        costFrequency: 'daily',
        nextInvoiceDate: 'soon',
        deactivatedAt: '2026-09-01T00:00:00.000Z',
      }),
    ).toEqual({
      name: 'Broken',
      iconRef: 'broken.example',
      category: null,
      costAmount: 1299,
      costFrequency: null,
      nextInvoiceDate: null,
      status: 'active',
      deactivatedAt: null,
    });
  });
});

describe('groupReviewRows', () => {
  it('hides empty groups and orders rows within each group', () => {
    const state = createReviewState(
      [
        candidate({ group: 'needs_review', draft: draft({ name: 'A' }) }),
        candidate({ draft: draft({ name: 'B', iconRef: 'b.example' }) }),
        candidate({ group: 'needs_review', draft: draft({ name: 'C', iconRef: 'c.example' }) }),
      ],
      context,
    );

    expect(
      groupReviewRows(state.rows).map((section) => [section.group, section.rows.map((row) => row.draft.name)]),
    ).toEqual([
      ['ready', ['B']],
      ['needs_review', ['A', 'C']],
    ]);
  });
});

describe('setRowsSelected', () => {
  const state = createReviewState(
    [
      candidate({ draft: draft({ name: 'Ready' }) }),
      candidate({ group: 'needs_review', draft: draft({ name: 'Review', iconRef: 'review.example' }) }),
      candidate({ group: 'needs_fixes', draft: draft({ name: 'Fix', iconRef: '' }), error: 'Pick an icon' }),
    ],
    context,
  );

  it('selects rows without moving them between groups', () => {
    const next = setRowsSelected(state, ['row-1', 'row-0'], true);
    const cleared = setRowsSelected(next, ['row-0'], false);

    expect([...next.selectedIds].sort()).toEqual(['row-0', 'row-1']);
    expect([...cleared.selectedIds]).toEqual(['row-1']);
    expect(cleared.rows.map((row) => row.group)).toEqual(['ready', 'needs_review', 'needs_fixes']);
    expect(cleared.touched).toBe(true);
  });

  it('never selects Needs fixes rows', () => {
    expect(setRowsSelected(state, ['row-2'], true).selectedIds.has('row-2')).toBe(false);
  });
});

describe('applyRowEdit', () => {
  const fixed: ImportSubscriptionItem = {
    name: 'Mystery Box',
    iconRef: 'mysterybox.example',
    category: 'Deliveries',
    costAmount: 2500,
    costFrequency: 'monthly',
    nextInvoiceDate: '2026-10-05',
    status: 'active',
    deactivatedAt: null,
  };

  const state = createReviewState(
    [
      candidate({ draft: draft({ name: 'First' }) }),
      candidate({ draft: draft({ name: 'Second', iconRef: 'second.example' }) }),
      candidate({ group: 'needs_review', draft: draft({ name: 'Maybe', iconRef: 'maybe.example' }) }),
      candidate({ group: 'needs_fixes', draft: draft({ name: 'Mystery', iconRef: '' }), error: 'Pick an icon' }),
    ],
    context,
  );

  it('moves a fixed row to the end of Ready and selects it', () => {
    const next = applyRowEdit(state, 'row-3', fixed, context.categories);
    const [ready] = groupReviewRows(next.rows);

    expect(ready?.rows.map((row) => row.id)).toEqual(['row-0', 'row-1', 'row-3']);
    expect(next.rows[3]).toMatchObject({ group: 'ready', error: null, draft: fixed });
    expect(next.selectedIds.has('row-3')).toBe(true);
    expect(next.pendingCategories).toContain('Deliveries');
    expect(next.touched).toBe(true);
  });

  it('moves a verified Needs review row to Ready', () => {
    const next = applyRowEdit(state, 'row-2', { ...fixed, name: 'Maybe' }, context.categories);

    expect(next.rows[2]?.group).toBe('ready');
    expect(next.selectedIds.has('row-2')).toBe(true);
  });

  it('keeps an edited Ready row in place', () => {
    const next = applyRowEdit(state, 'row-0', { ...fixed, name: 'First' }, context.categories);
    const [ready] = groupReviewRows(next.rows);

    expect(ready?.rows.map((row) => row.id)).toEqual(['row-0', 'row-1']);
  });
});

describe('addPendingCategory', () => {
  it('adds a new name once and ignores existing categories', () => {
    const state = createReviewState([candidate()], context);
    const next = addPendingCategory(
      addPendingCategory(state, ' Fitness ', context.categories),
      'fitness',
      context.categories,
    );

    expect(next.pendingCategories).toEqual(['Fitness']);
    expect(addPendingCategory(state, 'music', context.categories).pendingCategories).toEqual([]);
  });
});

describe('isLikelyDuplicate', () => {
  const index = buildDuplicateIndex(context.subscriptions);

  it('ignores empty values and different subscriptions', () => {
    expect(isLikelyDuplicate({ name: 'Netflix', iconRef: '' }, index)).toBe(false);
    expect(isLikelyDuplicate({ name: '', iconRef: '' }, buildDuplicateIndex([{ name: '', iconRef: '' }]))).toBe(false);
  });
});

describe('selection summary', () => {
  it('imports selected Ready and Needs review rows in display order', () => {
    const state = setRowsSelected(
      createReviewState(
        [
          candidate({
            group: 'needs_review',
            draft: draft({ name: 'Weekly', costAmount: 300, costFrequency: 'weekly' }),
          }),
          candidate({
            draft: draft({ name: 'Yearly', iconRef: 'y.example', costAmount: 12000, costFrequency: 'yearly' }),
          }),
          candidate({ draft: draft({ name: 'Paused', iconRef: 'p.example', status: 'inactive' }) }),
        ],
        context,
      ),
      ['row-0'],
      true,
    );
    const items = getSelectedItems(state);

    expect(items.map((item) => item.name)).toEqual(['Yearly', 'Paused', 'Weekly']);
    // $120/yr is $10/mo and $3/wk is $13/mo. Inactive rows add no spend.
    expect(summarizeSelection(items)).toEqual({ count: 3, monthlyCents: 2300 });
  });
});
