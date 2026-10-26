import { createServerFn } from '@tanstack/react-start';

import { requireAuthMiddleware } from '@/features/auth/middleware';
import {
  categorizeSubscriptionsInputSchema,
  clearSubscriptionsInputSchema,
  createSubscriptionInputSchema,
  deactivateSubscriptionsInputSchema,
  deleteSubscriptionsInputSchema,
  importSubscriptionsInputSchema,
  listSubscriptionsInputSchema,
  moveSubscriptionsInputSchema,
  reactivateSubscriptionsInputSchema,
  seedSubscriptionsInputSchema,
  undoDeactivationInputSchema,
  updateSubscriptionInputSchema,
} from '@/features/subscriptions/schema';
import {
  categorizeMySubscriptions,
  clearMySubscriptions,
  createMySubscription,
  deactivateMySubscriptions,
  deleteMySubscriptions,
  importMySubscriptions,
  listMySubscriptions,
  moveMySubscriptions,
  reactivateMySubscriptions,
  seedMySubscriptions,
  updateMySubscription,
  undoMyDeactivation,
} from '@/features/subscriptions/server';
import { withUserFacingErrors } from '@/lib/errors';

export const listSubscriptions = createServerFn({ method: 'GET' })
  .middleware([requireAuthMiddleware])
  .validator(listSubscriptionsInputSchema)
  .handler(async ({ context: { auth }, data }) => listMySubscriptions(auth.userId, data));

export const createSubscription = createServerFn({ method: 'POST' })
  .middleware([requireAuthMiddleware])
  .validator(createSubscriptionInputSchema)
  .handler(async ({ context: { auth }, data }) => {
    return createMySubscription({
      userId: auth.userId,
      name: data.name,
      collectionId: data.collectionId,
      iconRef: data.iconRef,
      categoryId: data.categoryId,
      costAmount: data.costAmount,
      costFrequency: data.costFrequency,
      nextInvoiceDate: data.nextInvoiceDate,
      notificationsIncluded: data.notificationsIncluded,
    });
  });

export const updateSubscription = createServerFn({ method: 'POST' })
  .middleware([requireAuthMiddleware])
  .validator(updateSubscriptionInputSchema)
  .handler(async ({ context: { auth }, data }) => {
    return updateMySubscription({
      userId: auth.userId,
      subscriptionId: data.subscriptionId,
      name: data.name,
      iconRef: data.iconRef,
      categoryId: data.categoryId,
      costAmount: data.costAmount,
      costFrequency: data.costFrequency,
      nextInvoiceDate: data.nextInvoiceDate,
      notificationsIncluded: data.notificationsIncluded,
    });
  });

export const moveSubscriptions = createServerFn({ method: 'POST' })
  .middleware([requireAuthMiddleware])
  .validator(moveSubscriptionsInputSchema)
  .handler(async ({ context: { auth }, data }) => {
    return withUserFacingErrors('Failed to move. Refresh and try again.', () =>
      moveMySubscriptions({
        userId: auth.userId,
        subscriptionIds: data.subscriptionIds,
        collectionId: data.collectionId,
      }),
    );
  });

export const categorizeSubscriptions = createServerFn({ method: 'POST' })
  .middleware([requireAuthMiddleware])
  .validator(categorizeSubscriptionsInputSchema)
  .handler(async ({ context: { auth }, data }) => {
    return withUserFacingErrors('Failed to change category. Refresh and try again.', () =>
      categorizeMySubscriptions({
        userId: auth.userId,
        subscriptionIds: data.subscriptionIds,
        categoryId: data.categoryId,
      }),
    );
  });

export const importSubscriptions = createServerFn({ method: 'POST' })
  .middleware([requireAuthMiddleware])
  .validator(importSubscriptionsInputSchema)
  .handler(async ({ context: { auth }, data }) => {
    return withUserFacingErrors('Failed to import. Try again.', () =>
      importMySubscriptions({
        userId: auth.userId,
        collectionId: data.collectionId,
        items: data.items,
      }),
    );
  });

export const seedSubscriptions = createServerFn({ method: 'POST' })
  .middleware([requireAuthMiddleware])
  .validator(seedSubscriptionsInputSchema)
  .handler(async ({ context: { auth }, data }) => {
    return seedMySubscriptions({ userId: auth.userId, collectionId: data.collectionId });
  });

export const clearSubscriptions = createServerFn({ method: 'POST' })
  .middleware([requireAuthMiddleware])
  .validator(clearSubscriptionsInputSchema)
  .handler(async ({ context: { auth }, data }) => {
    return clearMySubscriptions({ userId: auth.userId, collectionId: data.collectionId });
  });

export const deactivateSubscriptions = createServerFn({ method: 'POST' })
  .middleware([requireAuthMiddleware])
  .validator(deactivateSubscriptionsInputSchema)
  .handler(async ({ context: { auth }, data }) => {
    const result = await deactivateMySubscriptions({
      userId: auth.userId,
      subscriptionIds: data.subscriptionIds,
    });

    return { ...result, deactivatedAt: result.deactivatedAt.toISOString() };
  });

export const reactivateSubscriptions = createServerFn({ method: 'POST' })
  .middleware([requireAuthMiddleware])
  .validator(reactivateSubscriptionsInputSchema)
  .handler(async ({ context: { auth }, data }) => {
    return withUserFacingErrors('Failed to reactivate. Refresh and try again.', () =>
      reactivateMySubscriptions({
        userId: auth.userId,
        subscriptionIds: data.subscriptionIds,
        nextInvoiceDate: data.nextInvoiceDate,
      }),
    );
  });

export const undoDeactivation = createServerFn({ method: 'POST' })
  .middleware([requireAuthMiddleware])
  .validator(undoDeactivationInputSchema)
  .handler(async ({ context: { auth }, data }) => {
    return undoMyDeactivation({
      userId: auth.userId,
      subscriptionIds: data.subscriptionIds,
      deactivatedAt: new Date(data.deactivatedAt),
    });
  });

export const deleteSubscriptions = createServerFn({ method: 'POST' })
  .middleware([requireAuthMiddleware])
  .validator(deleteSubscriptionsInputSchema)
  .handler(async ({ context: { auth }, data }) => {
    return deleteMySubscriptions({ userId: auth.userId, subscriptionIds: data.subscriptionIds });
  });
