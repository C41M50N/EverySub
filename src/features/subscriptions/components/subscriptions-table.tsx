import {
  type ColumnFiltersState,
  type RowSelectionState,
  type SortingState,
  type Table as TableInstance,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { UploadIcon } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { CategoryRecord } from '@/features/categories/queries';
import type { CollectionRecord } from '@/features/collections/queries';
import type { MoveSubscriptions } from '@/features/subscriptions/components/move-subscriptions';
import {
  createSubscriptionColumns,
  type SubscriptionColumnActions,
} from '@/features/subscriptions/components/subscription-columns';
import { SubscriptionsTableFooter } from '@/features/subscriptions/components/subscriptions-table-footer';
import { SubscriptionsTableToolbar } from '@/features/subscriptions/components/subscriptions-table-toolbar';
import type { SubscriptionRecord } from '@/features/subscriptions/queries';
import type { SubscriptionView } from '@/features/subscriptions/search';
import { getDefaultSubscriptionSorting } from '@/features/subscriptions/table-state';
import { cn } from '@/lib/utils';

type UseSubscriptionsTableOptions = Omit<
  SubscriptionColumnActions,
  'onMove'
> & {
  data: SubscriptionRecord[];
  view: SubscriptionView;
  moveTargets: CollectionRecord[];
  onMove: MoveSubscriptions;
};

export function useSubscriptionsTable({
  data,
  view,
  moveTargets,
  onEdit,
  onMove,
  onDeactivate,
  onReactivate,
  onDelete,
}: UseSubscriptionsTableOptions) {
  // Sorting is keyed by view so a view switch never pairs the new columns
  // with a sort on a column that only exists in the previous view.
  const [sortingState, setSortingState] = useState<{
    view: SubscriptionView;
    sorting: SortingState;
  }>(() => ({ view, sorting: getDefaultSubscriptionSorting(view) }));
  const sorting =
    sortingState.view === view
      ? sortingState.sorting
      : getDefaultSubscriptionSorting(view);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  // A successful move clears the whole selection, matching bulk moves.
  const handleRowMove = useCallback(
    (subscription: SubscriptionRecord, target: CollectionRecord) =>
      onMove([subscription], target, { onSuccess: () => setRowSelection({}) }),
    [onMove],
  );

  const columns = useMemo(
    () =>
      createSubscriptionColumns(
        {
          onEdit,
          onMove: handleRowMove,
          onDeactivate,
          onReactivate,
          onDelete,
        },
        view,
        moveTargets,
      ),
    [
      handleRowMove,
      moveTargets,
      onDeactivate,
      onDelete,
      onEdit,
      onReactivate,
      view,
    ],
  );

  return useReactTable({
    data,
    columns,
    state: { sorting, columnFilters, rowSelection },
    getRowId: (row) => row.id,
    enableRowSelection: true,
    onSortingChange: (updater) =>
      setSortingState({
        view,
        sorting: typeof updater === 'function' ? updater(sorting) : updater,
      }),
    onColumnFiltersChange: setColumnFilters,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    // The table doesn't paginate. Left on, the reset runs from a microtask
    // queued during render and can update the table before it mounts.
    autoResetPageIndex: false,
  });
}

type SubscriptionsTableProps = {
  table: TableInstance<SubscriptionRecord>;
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
  onImport: () => void;
};

export function SubscriptionsTable({
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
  onImport,
}: SubscriptionsTableProps) {
  const rows = table.getRowModel().rows;
  const columnCount = table.getAllLeafColumns().length;
  const hasSubscriptions = table.getCoreRowModel().rows.length > 0;
  const isCollectionEmpty = activeCount + inactiveCount === 0;
  let emptyMessage = 'No subscriptions match your filters.';

  if (isCollectionEmpty) {
    emptyMessage = 'No subscriptions in this collection yet.';
  } else if (!hasSubscriptions) {
    emptyMessage =
      view === 'active'
        ? 'No active subscriptions.'
        : 'No inactive subscriptions.';
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <SubscriptionsTableToolbar
        table={table}
        categories={categories}
        view={view}
        activeCount={activeCount}
        inactiveCount={inactiveCount}
        moveTargets={moveTargets}
        isMovePending={isMovePending}
        onViewChange={onViewChange}
        onBulkMove={onBulkMove}
        onBulkCategorize={onBulkCategorize}
        onBulkDeactivate={onBulkDeactivate}
        onBulkReactivate={onBulkReactivate}
        onBulkDelete={onBulkDelete}
      />

      <ScrollArea className="min-h-0 flex-1 rounded-xl ring-1 ring-foreground/10">
        <Table containerClassName="overflow-visible">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className="sticky top-0 z-10 bg-muted-solid px-3 shadow-[inset_0_-1px_0_var(--border)] last:pr-4"
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={columnCount}
                  className={cn(
                    'text-center text-muted-foreground',
                    isCollectionEmpty ? 'h-40' : 'h-24',
                  )}
                >
                  <div className="flex flex-col items-center gap-3">
                    <p>{emptyMessage}</p>
                    {isCollectionEmpty && (
                      <Button variant="outline" size="sm" onClick={onImport}>
                        <UploadIcon data-icon="inline-start" />
                        Import subscriptions
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? 'selected' : undefined}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="px-3 py-2.5 last:pr-4">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </ScrollArea>

      <SubscriptionsTableFooter table={table} view={view} />
    </div>
  );
}
