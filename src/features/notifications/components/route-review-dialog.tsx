import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { NOTIFICATION_KIND_LABELS } from '@/features/notifications/components/destination-display';
import { InclusionList } from '@/features/notifications/components/inclusion-list';
import { useSetRoute } from '@/features/notifications/mutations';
import type {
  CollectionDestinationRecord,
  CollectionNotificationsData,
} from '@/features/notifications/queries';
import { getTimeZoneAbbreviation } from '@/features/notifications/time';
import type { NotificationKind } from '@/lib/db/notification-schema';

export type RouteReviewTarget = {
  destination: CollectionDestinationRecord;
  kind: NotificationKind;
};

type RouteReviewDialogProps = {
  target: RouteReviewTarget | null;
  onOpenChange: (open: boolean) => void;
  data: CollectionNotificationsData;
};

function describeStart(
  kind: NotificationKind,
  schedule: NonNullable<CollectionNotificationsData['schedule']>,
) {
  const zone = `${schedule.timeZone}, ${getTimeZoneAbbreviation(schedule.timeZone)}`;

  return kind === 'renewal_reminder'
    ? `Reminders go out at 9:00 AM (${zone}), ${schedule.reminderLeadDays} ${schedule.reminderLeadDays === 1 ? 'day' : 'days'} before each expected charge, starting with the next one still ahead. Nothing is sent right away.`
    : `Overviews go out at 9:00 AM (${zone}) on the 1st of each month, starting with the next one. Nothing is sent right away.`;
}

/**
 * Shown the first time a collection sends anything to a destination: the user
 * reviews which subscriptions may appear before the route is saved.
 */
export function RouteReviewDialog({
  target,
  onOpenChange,
  data,
}: RouteReviewDialogProps) {
  return (
    <Dialog open={target !== null} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(40rem,90svh)] flex-col gap-0 p-0 sm:max-w-lg">
        <RouteReviewContent
          target={target}
          onOpenChange={onOpenChange}
          data={data}
        />
      </DialogContent>
    </Dialog>
  );
}

/**
 * Mounts each time the dialog opens, so the choices start from each
 * subscription's saved inclusion.
 */
function RouteReviewContent({
  target,
  onOpenChange,
  data,
}: RouteReviewDialogProps) {
  const setRoute = useSetRoute();
  const [choices, setChoices] = useState(
    () =>
      new Map(
        data.subscriptions.map((subscription) => [
          subscription.id,
          subscription.notificationsIncluded,
        ]),
      ),
  );

  const includedCount = [...choices.values()].filter(Boolean).length;
  const destination = target?.destination;
  const kindLabel = target
    ? NOTIFICATION_KIND_LABELS[target.kind].toLowerCase()
    : '';

  function handleConfirm() {
    if (!target) {
      return;
    }

    setRoute.mutate(
      {
        collectionId: data.collection.id,
        destinationId: target.destination.id,
        kind: target.kind,
        enabled: true,
        reviewedInclusion: [...choices].map(([subscriptionId, included]) => ({
          subscriptionId,
          included,
        })),
      },
      {
        onSuccess: () => {
          toast.success(
            `${data.collection.name} now sends ${kindLabel} to “${target.destination.name}”`,
          );
          onOpenChange(false);
        },
        onError: (error) => toast.error(error.message),
      },
    );
  }

  return (
    <>
      <DialogHeader className="p-6 pb-4">
        <DialogTitle>
          Send {kindLabel} to “{destination?.name}”?
        </DialogTitle>
        <DialogDescription>
          Review which of {data.collection.name}’s subscriptions can appear in
          notifications. Excluded subscriptions never appear in any
          notification, and their amounts aren’t counted in totals.
        </DialogDescription>
      </DialogHeader>
      {target && data.schedule ? (
        <p className="mx-6 mb-4 rounded-lg bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
          {describeStart(target.kind, data.schedule)}
        </p>
      ) : null}
      <div className="flex items-center justify-between border-y px-6 py-2 text-sm">
        <span className="font-medium">Subscriptions</span>
        <span className="text-muted-foreground" aria-live="polite">
          {includedCount} of {data.subscriptions.length} included
        </span>
      </div>
      {data.subscriptions.length === 0 ? (
        <p className="px-6 py-6 text-sm text-muted-foreground">
          This collection has no subscriptions yet. New subscriptions are
          included unless you turn them off.
        </p>
      ) : (
        <ScrollArea className="min-h-0 flex-1 [--card-spacing:--spacing(6)]">
          <InclusionList
            subscriptions={data.subscriptions}
            isIncluded={(subscription) => choices.get(subscription.id) ?? true}
            onChange={(subscription, included) =>
              setChoices((previous) =>
                new Map(previous).set(subscription.id, included),
              )
            }
            disabled={setRoute.isPending}
          />
        </ScrollArea>
      )}
      <DialogFooter className="m-0 border-t p-4">
        <DialogClose
          render={<Button variant="outline" type="button" />}
          disabled={setRoute.isPending}
        >
          Cancel
        </DialogClose>
        <Button onClick={handleConfirm} disabled={setRoute.isPending}>
          {setRoute.isPending ? 'Turning on…' : `Turn on ${kindLabel}`}
        </Button>
      </DialogFooter>
    </>
  );
}
