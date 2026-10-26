import { z } from 'zod';

import { subscriptionCostFrequencyEnum, subscriptionStatusEnum } from '@/lib/db/subscription-schema';

export const subscriptionStatusSchema = z.enum(subscriptionStatusEnum.enumValues, {
  error: 'Status must be active or inactive',
});

export const subscriptionCostFrequencySchema = z.enum(subscriptionCostFrequencyEnum.enumValues, {
  error: 'Choose a billing frequency',
});

const subscriptionNameSchema = z
  .string({ error: 'Name is required' })
  .trim()
  .min(1, 'Name is required')
  .max(100, 'Name must be 100 characters or fewer');
const categorySchema = z
  .string({ error: 'Category is required' })
  .trim()
  .min(1, 'Category is required')
  .max(100, 'Category must be 100 characters or fewer');
const categoryIdSchema = z.string().min(1, 'Category is required');
const iconRefSchema = z
  .string({ error: 'Icon is required' })
  .trim()
  .min(1, 'Icon is required')
  .max(200, 'Icon must be 200 characters or fewer');
/** Postgres int4 upper bound — `cost_amount` is an `integer` column. */
export const MAX_COST_AMOUNT_CENTS = 2_147_483_647;

const costAmountSchema = z
  .number({
    error: (issue) =>
      issue.input === undefined || issue.input === null || issue.input === ''
        ? 'Cost is required'
        : 'Enter a valid cost',
  })
  .int('Cost must be in whole cents')
  .nonnegative('Cost must be zero or more')
  .max(MAX_COST_AMOUNT_CENTS, 'Cost is too large');
const invoiceDateSchema = z.iso.date({ error: 'Enter a valid next invoice date' });
const deactivatedAtSchema = z.iso.datetime({ offset: true, error: 'Enter a valid deactivation time' });

export const listSubscriptionsInputSchema = z
  .object({
    collectionId: z.string().min(1).optional(),
    status: subscriptionStatusSchema.optional(),
  })
  .optional();

export const createSubscriptionInputSchema = z.object({
  name: subscriptionNameSchema,
  collectionId: z.string().min(1),
  iconRef: iconRefSchema,
  categoryId: categoryIdSchema.nullable(),
  costAmount: costAmountSchema,
  costFrequency: subscriptionCostFrequencySchema,
  nextInvoiceDate: invoiceDateSchema,
  notificationsIncluded: z.boolean().optional(),
});

export const updateSubscriptionInputSchema = z.object({
  subscriptionId: z.string().min(1),
  name: subscriptionNameSchema.optional(),
  iconRef: iconRefSchema.optional(),
  categoryId: categoryIdSchema.nullable().optional(),
  costAmount: costAmountSchema.optional(),
  costFrequency: subscriptionCostFrequencySchema.optional(),
  nextInvoiceDate: invoiceDateSchema.optional(),
  notificationsIncluded: z.boolean().optional(),
});

const uniqueSubscriptionIdsSchema = z
  .array(z.string().min(1))
  .min(1)
  .max(500)
  .refine((ids) => new Set(ids).size === ids.length, 'Subscription IDs must be unique');

export const subscriptionIdsInputSchema = z.object({
  subscriptionIds: uniqueSubscriptionIdsSchema,
});

export const deactivateSubscriptionsInputSchema = subscriptionIdsInputSchema;

export const reactivateSubscriptionsInputSchema = subscriptionIdsInputSchema.extend({
  nextInvoiceDate: invoiceDateSchema.optional(),
});

export const undoDeactivationInputSchema = subscriptionIdsInputSchema.extend({
  deactivatedAt: z.iso.datetime({ offset: true }),
});

export const deleteSubscriptionsInputSchema = subscriptionIdsInputSchema;

export const moveSubscriptionsInputSchema = subscriptionIdsInputSchema.extend({
  collectionId: z.string().min(1),
});

export const categorizeSubscriptionsInputSchema = subscriptionIdsInputSchema.extend({
  categoryId: categoryIdSchema,
});

export const subscriptionTransferFormatSchema = z.enum(['json', 'csv']);

export const exportSubscriptionsInputSchema = z.object({
  format: subscriptionTransferFormatSchema,
  collectionId: z.string().min(1).optional(),
});

// Export files store an empty string for Uncategorized.
const importCategorySchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
  categorySchema.nullable(),
);
const importCostAmountCentsSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() !== '' ? Number(value) : value),
  costAmountSchema,
);
/** How far past the import time a deactivation timestamp may be, for clock skew. */
export const FUTURE_TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;

export function isDeactivatedAtInFuture(deactivatedAt: string, now = new Date()): boolean {
  return Date.parse(deactivatedAt) > now.getTime() + FUTURE_TIMESTAMP_TOLERANCE_MS;
}

const importDeactivatedAtSchema = z.preprocess(
  (value) => (value === '' ? null : value),
  deactivatedAtSchema
    .refine((value) => !isDeactivatedAtInFuture(value), 'Deactivation time can’t be in the future')
    .nullish(),
);

// One row of an EverySub export file. The export's `collection` field is ignored
// because every row is imported into the chosen collection.
export const subscriptionImportRowSchema = z.object({
  name: subscriptionNameSchema,
  status: subscriptionStatusSchema,
  category: importCategorySchema,
  iconRef: iconRefSchema,
  costAmountCents: importCostAmountCentsSchema,
  costFrequency: subscriptionCostFrequencySchema,
  nextInvoiceDate: invoiceDateSchema,
  deactivatedAt: importDeactivatedAtSchema,
});

export type SubscriptionImportRow = z.infer<typeof subscriptionImportRowSchema>;

// Rows are validated one by one so a bad row doesn't reject the whole file.
export const subscriptionImportEnvelopeSchema = z.object({
  type: z.literal('everysub.subscriptions'),
  version: z.literal(1),
  subscriptions: z.array(z.unknown()),
});

export const MAX_IMPORT_ITEMS = 150;

// A reviewed subscription ready to be written. `category` is a name so pending
// categories can be created when the import commits.
export const importSubscriptionItemSchema = z.object({
  name: subscriptionNameSchema,
  iconRef: iconRefSchema,
  category: categorySchema.nullable(),
  costAmount: costAmountSchema,
  costFrequency: subscriptionCostFrequencySchema,
  nextInvoiceDate: invoiceDateSchema,
  status: subscriptionStatusSchema,
  deactivatedAt: deactivatedAtSchema.nullable(),
});

export type ImportSubscriptionItem = z.infer<typeof importSubscriptionItemSchema>;

export const importSubscriptionsInputSchema = z.object({
  collectionId: z.string().min(1),
  items: z.array(importSubscriptionItemSchema).min(1).max(MAX_IMPORT_ITEMS),
});

// Dev-only seeding/clearing operate on a single collection.
export const seedSubscriptionsInputSchema = z.object({
  collectionId: z.string().min(1),
});

export const clearSubscriptionsInputSchema = z.object({
  collectionId: z.string().min(1),
});
