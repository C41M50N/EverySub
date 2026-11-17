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
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useRenameCollection } from '@/features/collections/mutations';
import { collectionNameSchema } from '@/features/collections/schema';

interface RenameCollectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collection: { id: string; name: string } | null;
}

export function RenameCollectionDialog({
  open,
  ...props
}: RenameCollectionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={props.onOpenChange}>
      <DialogContent className="w-84">
        <RenameCollectionForm {...props} />
      </DialogContent>
    </Dialog>
  );
}

/**
 * Mounts each time the dialog opens, so the input starts from the target
 * collection's current name.
 */
function RenameCollectionForm({
  collection,
  onOpenChange,
}: Omit<RenameCollectionDialogProps, 'open'>) {
  const renameCollection = useRenameCollection();

  const [name, setName] = useState(collection?.name ?? '');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!collection) {
      return;
    }

    const parsed = collectionNameSchema.safeParse(name);

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid name');
      return;
    }

    // Nothing changed: close without hitting the server.
    if (parsed.data === collection.name) {
      onOpenChange(false);
      return;
    }

    setError(null);

    renameCollection.mutate(
      { collectionId: collection.id, name: parsed.data },
      {
        onSuccess: (updated) => {
          toast.success(`Collection renamed to "${updated.name}"`);
          onOpenChange(false);
        },
        onError: (mutationError) => {
          setError(mutationError.message);
          toast.error('Failed to rename collection');
        },
      },
    );
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-6">
      <DialogHeader>
        <DialogTitle>Rename collection</DialogTitle>
        <DialogDescription>Give this collection a new name.</DialogDescription>
      </DialogHeader>
      <Field data-invalid={error ? true : undefined}>
        <FieldLabel htmlFor="rename-collection-name">Name</FieldLabel>
        <Input
          id="rename-collection-name"
          autoFocus
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            if (error) {
              setError(null);
            }
          }}
          placeholder="e.g. Personal, Work, Streaming"
          aria-invalid={error ? true : undefined}
          disabled={renameCollection.isPending}
        />
        <FieldError>{error}</FieldError>
      </Field>
      <DialogFooter>
        <DialogClose
          render={<Button variant="outline" type="button" />}
          disabled={renameCollection.isPending}
        >
          Cancel
        </DialogClose>
        <Button type="submit" disabled={renameCollection.isPending}>
          {renameCollection.isPending ? 'Saving…' : 'Save changes'}
        </Button>
      </DialogFooter>
    </form>
  );
}
