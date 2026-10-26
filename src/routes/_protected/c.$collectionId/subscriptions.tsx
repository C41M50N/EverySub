import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { PlusIcon, UploadIcon } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { categoriesQueryOptions } from '@/features/categories/queries';
import {
  collectionsQueryOptions,
  type CollectionRecord,
} from '@/features/collections/queries';
import { ImportSubscriptionsDialog } from '@/features/imports/components/import-subscriptions-dialog';
import { CostMetrics } from '@/features/subscriptions/components/cost-metrics';
import { DeactivateSubscriptionDialog } from '@/features/subscriptions/components/deactivate-subscription-dialog';
import { DeleteSubscriptionDialog } from '@/features/subscriptions/components/delete-subscription-dialog';
import { MonthlyBreakdown } from '@/features/subscriptions/components/monthly-breakdown';
import { useMoveSubscriptionsWithFeedback } from '@/features/subscriptions/components/move-subscriptions';
import { ReactivateSubscriptionDialog } from '@/features/subscriptions/components/reactivate-subscription-dialog';
import { SetCategoryDialog } from '@/features/subscriptions/components/set-category-dialog';
import { SubscriptionFormDialog } from '@/features/subscriptions/components/subscription-form-dialog';
import {
  SubscriptionsTable,
  useSubscriptionsTable,
} from '@/features/subscriptions/components/subscriptions-table';
import type { SubscriptionRecord } from '@/features/subscriptions/queries';
import { subscriptionsQueryOptions } from '@/features/subscriptions/queries';
import {
  getSubscriptionView,
  toSubscriptionRouteSearch,
  validateSubscriptionSearch,
  type SubscriptionView,
} from '@/features/subscriptions/search';
import { cn } from '@/lib/utils';

export const Route = createFileRoute(
  '/_protected/c/$collectionId/subscriptions',
)({
  validateSearch: validateSubscriptionSearch,
  loaderDeps: ({ search }) => ({ view: getSubscriptionView(search) }),
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(
        subscriptionsQueryOptions({
          collectionId: params.collectionId,
          status: 'active',
        }),
      ),
      context.queryClient.ensureQueryData(
        subscriptionsQueryOptions({
          collectionId: params.collectionId,
          status: 'inactive',
        }),
      ),
      context.queryClient.ensureQueryData(
        categoriesQueryOptions(params.collectionId),
      ),
    ]);
  },
  component: RouteComponent,
});

function RouteComponent() {
  const { collectionId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const view = getSubscriptionView(search);
  const { data: activeSubscriptions } = useSuspenseQuery(
    subscriptionsQueryOptions({ collectionId, status: 'active' }),
  );
  const { data: inactiveSubscriptions } = useSuspenseQuery(
    subscriptionsQueryOptions({ collectionId, status: 'inactive' }),
  );
  const { data: categories } = useSuspenseQuery(
    categoriesQueryOptions(collectionId),
  );
  const { data: collections } = useSuspenseQuery(collectionsQueryOptions());
  const collection = collections.find(
    (candidate) => candidate.id === collectionId,
  );
  // The collections query is already ordered by name.
  const moveTargets = useMemo(
    () => collections.filter((collection) => collection.id !== collectionId),
    [collectionId, collections],
  );
  const { move, isPending: isMovePending } = useMoveSubscriptionsWithFeedback();

  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importCollectionId, setImportCollectionId] = useState(collectionId);
  const [editTarget, setEditTarget] = useState<SubscriptionRecord | null>(null);
  const [deleteTargets, setDeleteTargets] = useState<SubscriptionRecord[]>([]);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deactivateTargets, setDeactivateTargets] = useState<
    SubscriptionRecord[]
  >([]);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [reactivateTargets, setReactivateTargets] = useState<
    SubscriptionRecord[]
  >([]);
  const [reactivateOpen, setReactivateOpen] = useState(false);
  const [categorizeTargets, setCategorizeTargets] = useState<
    SubscriptionRecord[]
  >([]);
  const [categorizeOpen, setCategorizeOpen] = useState(false);
  const data = view === 'active' ? activeSubscriptions : inactiveSubscriptions;

  // This page stays mounted when navigating to another collection, such as
  // with Back and Forward, so an open import closes instead of carrying over.
  if (importCollectionId !== collectionId) {
    setImportCollectionId(collectionId);
    setImportOpen(false);
  }

  const handleEdit = useCallback((subscription: SubscriptionRecord) => {
    setEditTarget(subscription);
  }, []);

  const handleDelete = useCallback((subscription: SubscriptionRecord) => {
    setDeleteTargets([subscription]);
    setDeleteOpen(true);
  }, []);

  const handleDeactivate = useCallback((subscription: SubscriptionRecord) => {
    setDeactivateTargets([subscription]);
    setDeactivateOpen(true);
  }, []);

  const handleReactivate = useCallback((subscription: SubscriptionRecord) => {
    setReactivateTargets([subscription]);
    setReactivateOpen(true);
  }, []);

  const table = useSubscriptionsTable({
    data,
    view,
    moveTargets,
    onEdit: handleEdit,
    onMove: move,
    onDeactivate: handleDeactivate,
    onReactivate: handleReactivate,
    onDelete: handleDelete,
  });

  const selectedItems = table
    .getFilteredSelectedRowModel()
    .rows.map((row) => row.original);
  const visibleItems = table
    .getFilteredRowModel()
    .rows.map((row) => row.original);
  const baseItems = selectedItems.length > 0 ? selectedItems : visibleItems;

  function handleBulkDelete() {
    setDeleteTargets(selectedItems);
    setDeleteOpen(true);
  }

  function handleBulkMove(target: CollectionRecord) {
    move(selectedItems, target, {
      onSuccess: () => table.resetRowSelection(),
    });
  }

  function handleBulkCategorize() {
    setCategorizeTargets(selectedItems);
    setCategorizeOpen(true);
  }

  function handleBulkDeactivate() {
    setDeactivateTargets(selectedItems);
    setDeactivateOpen(true);
  }

  function handleBulkReactivate() {
    setReactivateTargets(selectedItems);
    setReactivateOpen(true);
  }

  function handleViewChange(nextView: SubscriptionView) {
    table.resetRowSelection();
    void navigate({
      search: toSubscriptionRouteSearch(nextView),
      replace: true,
    });
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 roomy:min-h-0">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Subscriptions</h1>
          <p className="text-sm text-muted-foreground">
            Track spending across this collection.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <UploadIcon data-icon="inline-start" />
            Import
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <PlusIcon data-icon="inline-start" />
            Add subscription
          </Button>
        </div>
      </header>

      {view === 'active' && (
        <CostMetrics items={visibleItems} selectedItems={selectedItems} />
      )}

      <div
        className={cn(
          'roomy:min-h-0 roomy:flex-1',
          view === 'active'
            ? 'grid items-start gap-6 lg:grid-cols-3'
            : 'flex min-h-0 flex-col',
        )}
      >
        <div className="flex min-h-0 flex-col lg:col-span-2 roomy:max-h-full">
          <SubscriptionsTable
            table={table}
            categories={categories}
            view={view}
            activeCount={activeSubscriptions.length}
            inactiveCount={inactiveSubscriptions.length}
            moveTargets={moveTargets}
            isMovePending={isMovePending}
            onViewChange={handleViewChange}
            onBulkMove={handleBulkMove}
            onBulkCategorize={handleBulkCategorize}
            onBulkDeactivate={handleBulkDeactivate}
            onBulkReactivate={handleBulkReactivate}
            onBulkDelete={handleBulkDelete}
            onImport={() => setImportOpen(true)}
          />
        </div>
        {view === 'active' && <MonthlyBreakdown items={baseItems} />}
      </div>

      {collection && (
        <ImportSubscriptionsDialog
          collection={{ id: collection.id, name: collection.name }}
          open={importOpen}
          onOpenChange={setImportOpen}
        />
      )}

      <SubscriptionFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        collectionId={collectionId}
        categories={categories}
        onCreated={() => handleViewChange('active')}
      />

      <SubscriptionFormDialog
        open={editTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditTarget(null);
          }
        }}
        collectionId={collectionId}
        subscription={editTarget}
        categories={categories}
      />

      <SetCategoryDialog
        open={categorizeOpen}
        onOpenChange={setCategorizeOpen}
        collectionId={collectionId}
        subscriptions={categorizeTargets}
        categories={categories}
        onCategorized={() => table.resetRowSelection()}
      />

      <DeleteSubscriptionDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        subscriptions={deleteTargets}
        onDeleted={() => table.resetRowSelection()}
      />

      <DeactivateSubscriptionDialog
        open={deactivateOpen}
        onOpenChange={setDeactivateOpen}
        subscriptions={deactivateTargets}
        onDeactivated={() => table.resetRowSelection()}
      />

      <ReactivateSubscriptionDialog
        open={reactivateOpen}
        onOpenChange={setReactivateOpen}
        subscriptions={reactivateTargets}
        onReactivated={() => table.resetRowSelection()}
      />
    </div>
  );
}
