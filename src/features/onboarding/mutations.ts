import { useMutation, useQueryClient } from '@tanstack/react-query';

import { collectionsQueryOptions } from '@/features/collections/queries';
import { markReminderInvitationShown, setUpAccount } from '@/features/onboarding/api';
import { onboardingQueryKey, type OnboardingData } from '@/features/onboarding/queries';
import { track } from '@/lib/analytics';

export function useSetUpAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (timeZone: string | undefined) => setUpAccount({ data: { timeZone } }),
    // The collection routes read the cached list, which is still empty here.
    // It was hydrated from the server without a query function, so
    // invalidating it couldn't refetch; fetch it outright before navigating.
    onSuccess: async () => {
      track('account_set_up');

      await queryClient.fetchQuery({ ...collectionsQueryOptions(), staleTime: 0 });
      void queryClient.invalidateQueries({ queryKey: onboardingQueryKey });
    },
  });
}

export function useMarkReminderInvitationShown() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => markReminderInvitationShown(),
    retry: 3,
    // Consume the cached invitation only after the server records it.
    onSuccess: () =>
      queryClient.setQueryData<OnboardingData>(onboardingQueryKey, (current) =>
        current ? { ...current, reminderInvitation: null } : current,
      ),
  });
}
