import { useMutation, useQueryClient } from '@tanstack/react-query';

import { collectionsListQueryKey } from '@/features/collections/queries';
import { markReminderInvitationShown, setUpAccount } from '@/features/onboarding/api';
import { onboardingQueryKey, type OnboardingData } from '@/features/onboarding/queries';
import { track } from '@/lib/analytics';

export function useSetUpAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (timeZone: string | undefined) => setUpAccount({ data: { timeZone } }),
    // The collection routes read the cached list, which is still empty and
    // unobserved here, so it has to refetch before navigating.
    onSuccess: () => {
      track('account_set_up');

      return Promise.all([
        queryClient.invalidateQueries({ queryKey: collectionsListQueryKey, refetchType: 'all' }),
        queryClient.invalidateQueries({ queryKey: onboardingQueryKey }),
      ]);
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
