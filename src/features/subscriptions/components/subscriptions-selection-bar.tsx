import {
  CirclePauseIcon,
  RotateCcwIcon,
  TagIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import type { CollectionRecord } from '@/features/collections/queries';
import { MoveToButton } from '@/features/subscriptions/components/move-subscriptions';
import type { SubscriptionView } from '@/features/subscriptions/search';
import { cn } from '@/lib/utils';

type SubscriptionsSelectionBarProps = {
  selectedCount: number;
  visibleCount: number;
  view: SubscriptionView;
  moveTargets: CollectionRecord[];
  isMovePending: boolean;
  onSelectAll: () => void;
  onClear: () => void;
  onBulkMove: (target: CollectionRecord) => void;
  onBulkCategorize: () => void;
  onBulkDeactivate: () => void;
  onBulkReactivate: () => void;
  onBulkDelete: () => void;
};

/**
 * Bulk actions for the selected rows, revealed beneath the table toolbar.
 *
 * The bar collapses instead of unmounting so it can ease in and out, which
 * softens the table shifting down to make room for it.
 */
export function SubscriptionsSelectionBar({
  selectedCount,
  visibleCount,
  view,
  moveTargets,
  isMovePending,
  onSelectAll,
  onClear,
  onBulkMove,
  onBulkCategorize,
  onBulkDeactivate,
  onBulkReactivate,
  onBulkDelete,
}: SubscriptionsSelectionBarProps) {
  const isOpen = selectedCount > 0;

  // Keeps the last count on screen while the bar collapses after a clear.
  const [displayedCount, setDisplayedCount] = useState(selectedCount);

  if (isOpen && displayedCount !== selectedCount) {
    setDisplayedCount(selectedCount);
  }

  return (
    <div
      className={cn(
        'grid transition-[grid-template-rows,opacity] duration-150 ease-reveal motion-reduce:transition-none',
        isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
      )}
      inert={!isOpen}
    >
      <div className="min-h-0 overflow-hidden">
        <div className="pt-2">
          <div
            role="group"
            aria-label="Bulk actions"
            className="flex min-h-10 flex-wrap items-center gap-1 rounded-lg bg-primary/5 p-1 inset-ring-1 inset-ring-primary/20 dark:bg-primary-light/10 dark:inset-ring-primary-light/20"
          >
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Clear selection"
              onClick={onClear}
            >
              <XIcon />
            </Button>
            <div className="flex flex-1 items-center gap-2.5 pl-0.5 text-sm whitespace-nowrap">
              <span aria-live="polite" className="font-semibold tabular-nums">
                {displayedCount} of {visibleCount} selected
              </span>
              {displayedCount < visibleCount && (
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto px-0 dark:text-primary-light"
                  onClick={onSelectAll}
                >
                  Select all
                </Button>
              )}
            </div>
            <MoveToButton
              targets={moveTargets}
              disabled={isMovePending}
              onSelect={onBulkMove}
            />
            <Button variant="ghost" size="sm" onClick={onBulkCategorize}>
              <TagIcon data-icon="inline-start" />
              Set category
            </Button>
            {view === 'active' ? (
              <Button variant="ghost" size="sm" onClick={onBulkDeactivate}>
                <CirclePauseIcon data-icon="inline-start" />
                Deactivate
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={onBulkReactivate}>
                <RotateCcwIcon data-icon="inline-start" />
                Reactivate
              </Button>
            )}
            <Separator
              orientation="vertical"
              className="mx-1 h-5 bg-primary/20 data-vertical:self-center dark:bg-primary-light/20"
            />
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={onBulkDelete}
            >
              <Trash2Icon data-icon="inline-start" />
              Delete
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
