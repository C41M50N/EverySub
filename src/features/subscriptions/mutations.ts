import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { z } from 'zod';

import { categoriesListQueryKey, categoriesQueryOptions } from '@/features/categories/queries';
import { collectionsListQueryKey } from '@/features/collections/queries';
import { notificationsQueryKey } from '@/features/notifications/queries';
import { onboardingQueryKey } from '@/features/onboarding/queries';
import {
  clearSubscriptions,
  createSubscription,
  deactivateSubscriptions,
  deleteSubscriptions,
  importSubscriptions,
  moveSubscriptions,
  reactivateSubscriptions,
  seedSubscriptions,
  undoDeactivation,
  updateSubscription,
} from '@/features/subscriptions/api';
import { subscriptionsListQueryKey } from '@/features/subscriptions/queries';
import type {
  createSubscriptionInputSchema,
  importSubscriptionsInputSchema,
  updateSubscriptionInputSchema,
} from '@/features/subscriptions/schema';
import { track } from '@/lib/analytics';

export type CreateSubscriptionInput = z.infer<typeof createSubscriptionInputSchema>;
export type UpdateSubscriptionInput = z.infer<typeof updateSubscriptionInputSchema>;
export type ImportSubscriptionsInput = z.infer<typeof importSubscriptionsInputSchema>;

// Subscription changes also change the notification inclusion lists.
function invalidateSubscriptionViews(queryClient: ReturnType<typeof useQueryClient>) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: subscriptionsListQueryKey }),
    queryClient.invalidateQueries({ queryKey: notificationsQueryKey }),
  ]);
}

// Adding subscriptions can complete onboarding. Onboarding refreshes after the
// subscriptions and isn't awaited, so the dialog that saved them closes without
// waiting on it.
function refreshOnboarding(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: onboardingQueryKey });
}

export function useCreateSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateSubscriptionInput) => createSubscription({ data: input }),
    onSuccess: async () => {
      track('subscription_created');
      await invalidateSubscriptionViews(queryClient);
      refreshOnboarding(queryClient);
    },
  });
}

export function useUpdateSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateSubscriptionInput) => updateSubscription({ data: input }),
    onSuccess: () => invalidateSubscriptionViews(queryClient),
  });
}

export function useDeleteSubscriptions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (subscriptionIds: string[]) => deleteSubscriptions({ data: { subscriptionIds } }),
    onSuccess: () => invalidateSubscriptionViews(queryClient),
  });
}

function useLifecycleMutation<Variables, Result>(mutationFn: (variables: Variables) => Promise<Result>) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: () => invalidateSubscriptionViews(queryClient),
  });
}

export function useDeactivateSubscriptions() {
  return useLifecycleMutation((subscriptionIds: string[]) => deactivateSubscriptions({ data: { subscriptionIds } }));
}

export function useReactivateSubscriptions() {
  return useLifecycleMutation((input: { subscriptionIds: string[]; nextInvoiceDate?: string }) =>
    reactivateSubscriptions({ data: input }),
  );
}

export function useUndoDeactivation() {
  return useLifecycleMutation((input: { subscriptionIds: string[]; deactivatedAt: string }) =>
    undoDeactivation({ data: input }),
  );
}

// A move changes subscriptions in two collections and may create categories in
// the target. Collections and recorded invoices are unaffected.
export function useMoveSubscriptions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { subscriptionIds: string[]; collectionId: string }) => moveSubscriptions({ data: input }),
    onSuccess: (_result, input) =>
      Promise.all([
        invalidateSubscriptionViews(queryClient),
        queryClient.invalidateQueries({ queryKey: categoriesQueryOptions(input.collectionId).queryKey }),
      ]),
  });
}

// An import adds subscriptions to one collection and may create categories in it.
export function useImportSubscriptions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ImportSubscriptionsInput) => importSubscriptions({ data: input }),
    onSuccess: async (_result, input) => {
      await Promise.all([
        invalidateSubscriptionViews(queryClient),
        queryClient.invalidateQueries({ queryKey: categoriesQueryOptions(input.collectionId).queryKey }),
      ]);
      refreshOnboarding(queryClient);
    },
  });
}

// Dev-only: seeding can create categories, so invalidate categories too. Collections
// are invalidated to refresh any aggregate counts derived from them.
function invalidateSeededData(queryClient: ReturnType<typeof useQueryClient>) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: subscriptionsListQueryKey }),
    queryClient.invalidateQueries({ queryKey: categoriesListQueryKey }),
    queryClient.invalidateQueries({ queryKey: collectionsListQueryKey }),
  ]);
}

export function useSeedSubscriptions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (collectionId: string) => seedSubscriptions({ data: { collectionId } }),
    onSuccess: () => invalidateSeededData(queryClient),
  });
}

export function useClearSubscriptions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (collectionId: string) => clearSubscriptions({ data: { collectionId } }),
    onSuccess: () => invalidateSeededData(queryClient),
  });
}
