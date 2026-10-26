import { useEffect, useState } from 'react';
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
import { useCreateCategory } from '@/features/categories/mutations';
import {
  CategoryCombobox,
  type CategoryOption,
} from '@/features/subscriptions/components/category-combobox';
import { useCategorizeSubscriptions } from '@/features/subscriptions/mutations';
import type { SubscriptionRecord } from '@/features/subscriptions/queries';

type SetCategoryDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collectionId: string;
  subscriptions: SubscriptionRecord[];
  categories: CategoryOption[];
  onCategorized?: () => void;
};

/** The category every subscription already shares, if there is one. */
function getSharedCategoryId(subscriptions: SubscriptionRecord[]) {
  const [first, ...rest] = subscriptions;
  const categoryId = first?.categoryId ?? null;

  return rest.every((subscription) => subscription.categoryId === categoryId)
    ? categoryId
    : null;
}

export function SetCategoryDialog({
  open,
  onOpenChange,
  collectionId,
  subscriptions,
  categories,
  onCategorized,
}: SetCategoryDialogProps) {
  const categorizeSubscriptions = useCategorizeSubscriptions();
  const createCategory = useCreateCategory();
  const isPending = categorizeSubscriptions.isPending;

  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const count = subscriptions.length;
  const target =
    count === 1
      ? `“${subscriptions[0]?.name ?? ''}”`
      : `${count} subscriptions`;

  // Start from the category the subscriptions already share each time the
  // dialog opens.
  useEffect(() => {
    if (open) {
      setCategoryId(getSharedCategoryId(subscriptions));
      setError(null);
    }
  }, [open, subscriptions]);

  function handleChange(nextCategoryId: string | null) {
    setCategoryId(nextCategoryId);
    setError(null);
  }

  function handleCreateCategory(name: string) {
    createCategory.mutate(
      { collectionId, name },
      {
        onSuccess: (category) => handleChange(category.id),
        onError: () => toast.error('Failed to add category'),
      },
    );
  }

  function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    if (count === 0) {
      return;
    }

    if (!categoryId) {
      setError('Category is required');
      return;
    }

    // Nothing changed: close without hitting the server.
    if (
      subscriptions.every(
        (subscription) => subscription.categoryId === categoryId,
      )
    ) {
      onOpenChange(false);
      return;
    }

    const categoryName = categories.find(
      (category) => category.id === categoryId,
    )?.name;

    categorizeSubscriptions.mutate(
      {
        subscriptionIds: subscriptions.map((subscription) => subscription.id),
        categoryId,
      },
      {
        onSuccess: () => {
          toast.success(
            categoryName
              ? `Changed ${target} to ${categoryName}`
              : `Changed the category of ${target}`,
          );
          onOpenChange(false);
          onCategorized?.();
        },
        onError: () =>
          toast.error('Failed to change category. Refresh and try again.'),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-96">
        <form onSubmit={handleSubmit} className="grid gap-6">
          <DialogHeader>
            <DialogTitle>Set category</DialogTitle>
            <DialogDescription>
              Choose a category for {target}, or type to add a new one.
            </DialogDescription>
          </DialogHeader>
          <Field data-invalid={error ? true : undefined}>
            <FieldLabel htmlFor="set-category">Category</FieldLabel>
            <CategoryCombobox
              id="set-category"
              value={categoryId}
              onChange={handleChange}
              onCreate={handleCreateCategory}
              categories={categories}
              invalid={Boolean(error)}
              disabled={isPending}
              creating={createCategory.isPending}
            />
            <FieldError>{error}</FieldError>
          </Field>
          <DialogFooter>
            <DialogClose
              render={<Button variant="outline" type="button" />}
              disabled={isPending}
            >
              Cancel
            </DialogClose>
            <Button
              type="submit"
              disabled={isPending || createCategory.isPending}
            >
              {isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
