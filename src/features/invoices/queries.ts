import { queryOptions } from '@tanstack/react-query';

import { listInvoices, listInvoicesByCollection, listInvoicesBySubscription } from '@/features/invoices/api';

export type InvoicesListData = Awaited<ReturnType<typeof listInvoices>>;
export type InvoiceRecord = InvoicesListData[number];

export const invoicesListQueryKey = ['invoices', 'list'] as const;

export type CollectionInvoiceRange = {
  collectionId: string;
  startDate: string;
  endDate: string;
};

function collectionInvoicesQueryKey(input: CollectionInvoiceRange) {
  return ['invoices', 'by-collection', input.collectionId, input.startDate, input.endDate] as const;
}

export function subscriptionInvoicesQueryKey(subscriptionId: string) {
  return ['invoices', 'by-subscription', subscriptionId] as const;
}

export function invoicesQueryOptions() {
  return queryOptions({
    queryKey: invoicesListQueryKey,
    queryFn: () => listInvoices(),
  });
}

export function collectionInvoicesQueryOptions(input: CollectionInvoiceRange) {
  return queryOptions({
    queryKey: collectionInvoicesQueryKey(input),
    queryFn: () => listInvoicesByCollection({ data: input }),
  });
}

export function subscriptionInvoicesQueryOptions(subscriptionId: string) {
  return queryOptions({
    queryKey: subscriptionInvoicesQueryKey(subscriptionId),
    queryFn: () => listInvoicesBySubscription({ data: { subscriptionId } }),
  });
}
