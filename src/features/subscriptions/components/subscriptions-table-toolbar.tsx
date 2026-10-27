import type { Table } from '@tanstack/react-table';
import { SearchIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { CategoryRecord } from '@/features/categories/queries';
import type { CollectionRecord } from '@/features/collections/queries';
import { CategoryFilter } from '@/features/subscriptions/components/category-filter';
import { SubscriptionsSelectionBar } from '@/features/subscriptions/components/subscriptions-selection-bar';
import type { SubscriptionRecord } from '@/features/subscriptions/queries';
import type { SubscriptionView } from '@/features/subscriptions/search';
import { cn } from '@/lib/utils';

type SubscriptionsTableToolbarProps = {
  table: Table<SubscriptionRecord>;
  categories: CategoryRecord[];
  view: SubscriptionView;
  activeCount: number;
  inactiveCount: number;
  moveTargets: CollectionRecord[];
  isMovePending: boolean;
  onViewChange: (view: SubscriptionView) => void;
  onBulkMove: (target: CollectionRecord) => void;
  onBulkCategorize: () => void;
  onBulkDeactivate: () => void;
  onBulkReactivate: () => void;
  onBulkDelete: () => void;
};

export function SubscriptionsTableToolbar({
  table,
  categories,
  view,
  activeCount,
  inactiveCount,
  moveTargets,
  isMovePending,
  onViewChange,
  onBulkMove,
  onBulkCategorize,
  onBulkDeactivate,
  onBulkReactivate,
  onBulkDelete,
}: SubscriptionsTableToolbarProps) {
  const nameColumn = table.getColumn('name');
  const categoryColumn = table.getColumn('category');

  const nameFilter = (nameColumn?.getFilterValue() as string) ?? '';
  const selectedCategories =
    (categoryColumn?.getFilterValue() as string[]) ?? [];
  const selectedCount = table.getFilteredSelectedRowModel().rows.length;
  const visibleCount = table.getFilteredRowModel().rows.length;

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-2">
        <div
          className="inline-flex rounded-lg bg-muted p-1 ring-1 ring-foreground/10"
          role="group"
          aria-label="Subscription view"
        >
          {(['active', 'inactive'] as const).map((option) => (
            <Button
              key={option}
              aria-pressed={view === option}
              variant="ghost"
              size="sm"
              className={cn(
                'min-w-24',
                view === option &&
                  'bg-background shadow-xs hover:bg-background',
              )}
              onClick={() => onViewChange(option)}
            >
              <span>{option === 'active' ? 'Active' : 'Inactive'}</span>
              <span className="tabular-nums text-muted-foreground">
                {option === 'active' ? activeCount : inactiveCount}
              </span>
            </Button>
          ))}
        </div>
        <div className="relative w-full sm:max-w-56">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={nameFilter}
            onChange={(event) => nameColumn?.setFilterValue(event.target.value)}
            placeholder="Search subscriptions"
            className="pl-8"
            aria-label="Search subscriptions by name"
          />
        </div>

        <CategoryFilter
          options={categories}
          selected={selectedCategories}
          onChange={(next) =>
            categoryColumn?.setFilterValue(next.length ? next : undefined)
          }
        />
      </div>

      <SubscriptionsSelectionBar
        selectedCount={selectedCount}
        visibleCount={visibleCount}
        view={view}
        moveTargets={moveTargets}
        isMovePending={isMovePending}
        onSelectAll={() => table.toggleAllPageRowsSelected(true)}
        onClear={() => table.resetRowSelection()}
        onBulkMove={onBulkMove}
        onBulkCategorize={onBulkCategorize}
        onBulkDeactivate={onBulkDeactivate}
        onBulkReactivate={onBulkReactivate}
        onBulkDelete={onBulkDelete}
      />
    </div>
  );
}
