import { useMutation, useQueryClient } from '@tanstack/react-query';

import { createCollection, deleteCollection, duplicateCollection, renameCollection } from '@/features/collections/api';
import { collectionsListQueryKey } from '@/features/collections/queries';
import { notificationsQueryKey } from '@/features/notifications/queries';
import { track } from '@/lib/analytics';

export function useCreateCollection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (name: string) => createCollection({ data: { name } }),
    onSuccess: () => {
      track('collection_created');
      return queryClient.invalidateQueries({
        queryKey: collectionsListQueryKey,
      });
    },
  });
}

export function useRenameCollection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { collectionId: string; name: string }) => renameCollection({ data: input }),
    // Notification routes list collections by name.
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: collectionsListQueryKey }),
        queryClient.invalidateQueries({ queryKey: notificationsQueryKey }),
      ]),
  });
}

export function useDuplicateCollection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (collectionId: string) => duplicateCollection({ data: { collectionId } }),
    onSuccess: () => {
      return queryClient.invalidateQueries({
        queryKey: collectionsListQueryKey,
      });
    },
  });
}

export function useDeleteCollection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (collectionId: string) => deleteCollection({ data: { collectionId } }),
    // Notification routes list collections by name.
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: collectionsListQueryKey }),
        queryClient.invalidateQueries({ queryKey: notificationsQueryKey }),
      ]),
  });
}
