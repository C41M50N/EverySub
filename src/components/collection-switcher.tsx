import { useSuspenseQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import {
  ChevronsUpDownIcon,
  GalleryVerticalEndIcon,
  PlusIcon,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { MenuActionItem } from '@/components/menu-action-item';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
  DropdownMenuGroup,
} from '@/components/ui/dropdown-menu';
import { CollectionOptionsMenu } from '@/features/collections/components/collection-options-menu';
import { NewCollectionDialog } from '@/features/collections/components/new-collection-dialog';
import { RenameCollectionDialog } from '@/features/collections/components/rename-collection-dialog';
import {
  useDeleteCollection,
  useDuplicateCollection,
} from '@/features/collections/mutations';
import { collectionsQueryOptions } from '@/features/collections/queries';
import { LAST_COLLECTION_DELETE_MESSAGE } from '@/features/collections/schema';
import { ImportSubscriptionsDialog } from '@/features/imports/components/import-subscriptions-dialog';
import type { SubscriptionTransferFormat } from '@/features/subscriptions/export';
import { track } from '@/lib/analytics';

type CollectionTarget = { id: string; name: string };

export function CollectionSwitcher() {
  const { collectionId } = useParams({ from: '/_protected/c/$collectionId' });
  const navigate = useNavigate();
  const { data: collections } = useSuspenseQuery(collectionsQueryOptions());

  const duplicateCollection = useDuplicateCollection();
  const deleteCollection = useDeleteCollection();

  const [isNewCollectionOpen, setIsNewCollectionOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<CollectionTarget | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] = useState<CollectionTarget | null>(
    null,
  );
  // Kept after closing so the dialog can finish its close animation.
  const [importTarget, setImportTarget] = useState<CollectionTarget | null>(
    null,
  );
  const [isImportOpen, setIsImportOpen] = useState(false);

  const activeCollection = collections.find(
    (collection) => collection.id === collectionId,
  );

  function handleDuplicate(collection: CollectionTarget) {
    duplicateCollection.mutate(collection.id, {
      onSuccess: (created) => {
        toast.success(`Collection duplicated as "${created.name}"`);
        navigate({
          to: '/c/$collectionId/dashboard',
          params: { collectionId: created.id },
        });
      },
      onError: () => {
        toast.error('Failed to duplicate collection');
      },
    });
  }

  function handleExport(
    collection: CollectionTarget,
    format: SubscriptionTransferFormat,
  ) {
    const params = new URLSearchParams({ format, collectionId: collection.id });
    const anchor = document.createElement('a');
    anchor.href = `/api/subscriptions/export?${params.toString()}`;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    track('subscriptions_exported', { format });
  }

  function handleDelete(collection: CollectionTarget) {
    // The server enforces this too, for a list that's out of date.
    if (collections.length === 1) {
      toast.error(LAST_COLLECTION_DELETE_MESSAGE);
      return;
    }

    setDeleteTarget({ id: collection.id, name: collection.name });
  }

  function handleConfirmDelete() {
    if (!deleteTarget) {
      return;
    }

    const target = deleteTarget;

    deleteCollection.mutate(target.id, {
      onSuccess: () => {
        toast.success(`Collection "${target.name}" deleted`);
        setDeleteTarget(null);

        // If we deleted the collection we're currently viewing, fall back to
        // the first remaining collection. The last one can't be deleted, but
        // /dashboard resolves a list that changed elsewhere.
        if (target.id === collectionId) {
          const [first] = collections.filter(
            (collection) => collection.id !== target.id,
          );

          if (first) {
            navigate({
              to: '/c/$collectionId/dashboard',
              params: { collectionId: first.id },
            });
          } else {
            navigate({ to: '/dashboard' });
          }
        }
      },
      onError: (error) => {
        setDeleteTarget(null);
        toast.error(error.message);
      },
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="px-2 w-full"
          render={<Button size="lg" variant="outline" />}
        >
          <div className="w-full px-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <GalleryVerticalEndIcon className="size-4.5 stroke-[1.75]" />
              {activeCollection?.name ?? 'Select collection'}
            </div>
            <ChevronsUpDownIcon className="size-4" />
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="start" side="right">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Collections</DropdownMenuLabel>
            {collections.map((collection) => (
              <DropdownMenuItem
                key={collection.id}
                className="py-1"
                onClick={() =>
                  navigate({
                    to: '/c/$collectionId/dashboard',
                    params: { collectionId: collection.id },
                  })
                }
              >
                <div className="w-full flex items-center justify-between">
                  <span
                    className={
                      collection.id === collectionId ? 'font-medium' : undefined
                    }
                  >
                    {collection.name}
                  </span>
                  <CollectionOptionsMenu
                    onRename={() =>
                      setRenameTarget({
                        id: collection.id,
                        name: collection.name,
                      })
                    }
                    onDuplicate={() => handleDuplicate(collection)}
                    onImport={() => {
                      setImportTarget({
                        id: collection.id,
                        name: collection.name,
                      });
                      setIsImportOpen(true);
                    }}
                    onExport={(format) => handleExport(collection, format)}
                    onDelete={() => handleDelete(collection)}
                  />
                </div>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setIsNewCollectionOpen(true)}>
              <MenuActionItem icon={PlusIcon} label="New Collection" />
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <NewCollectionDialog
        open={isNewCollectionOpen}
        onOpenChange={setIsNewCollectionOpen}
      />

      <RenameCollectionDialog
        open={renameTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRenameTarget(null);
          }
        }}
        collection={renameTarget}
      />

      {importTarget && (
        <ImportSubscriptionsDialog
          collection={importTarget}
          open={isImportOpen}
          onOpenChange={setIsImportOpen}
        />
      )}

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete collection?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes “{deleteTarget?.name}” and all of its
              subscriptions. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteCollection.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={deleteCollection.isPending}
            >
              {deleteCollection.isPending ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
