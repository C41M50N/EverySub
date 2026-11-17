import { format, parseISO } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from '@/components/ui/input-group';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useCreateCategory } from '@/features/categories/mutations';
import {
  CategoryCombobox,
  type CategoryOption,
} from '@/features/subscriptions/components/category-combobox';
import { IconPicker } from '@/features/subscriptions/components/icon-picker';
import {
  formatCentsForInput,
  formatFrequency,
  normalizeCostInput,
  parseCostToCents,
  sanitizeCostInput,
} from '@/features/subscriptions/cost';
import { formatInvoiceDate } from '@/features/subscriptions/format';
import {
  useCreateSubscription,
  useUpdateSubscription,
} from '@/features/subscriptions/mutations';
import type { SubscriptionRecord } from '@/features/subscriptions/queries';
import {
  createSubscriptionInputSchema,
  MAX_COST_AMOUNT_CENTS,
  updateSubscriptionInputSchema,
} from '@/features/subscriptions/schema';
import type {
  SubscriptionCostFrequency,
  SubscriptionStatus,
} from '@/features/subscriptions/server';
import { cn } from '@/lib/utils';

const FREQUENCY_OPTIONS: SubscriptionCostFrequency[] = [
  'weekly',
  'monthly',
  'yearly',
  'biennially',
];

/** Values a form opens with. Any of them may be missing or invalid. */
export type SubscriptionFormPrefill = {
  name: string;
  iconRef: string;
  categoryId: string | null;
  costAmount: number | null;
  costFrequency: SubscriptionCostFrequency | null;
  nextInvoiceDate: string | null;
};

/** A new subscription's starting values, with some already chosen. */
export function newSubscriptionPrefill(
  values: Partial<SubscriptionFormPrefill>,
): SubscriptionFormPrefill {
  return {
    name: '',
    iconRef: '',
    categoryId: null,
    costAmount: null,
    costFrequency: 'monthly',
    nextInvoiceDate: format(new Date(), 'yyyy-MM-dd'),
    ...values,
  };
}

export type SubscriptionFormValues = {
  name: string;
  iconRef: string;
  categoryId: string | null;
  costAmount: number;
  costFrequency: SubscriptionCostFrequency;
  nextInvoiceDate: string;
};

/**
 * Edits a subscription that isn't saved yet, such as an import row. Saving
 * validates with the usual rules and hands the values back without writing to
 * the database. New categories stay local too.
 */
export type SubscriptionFormReviewMode = {
  prefill: SubscriptionFormPrefill;
  status: SubscriptionStatus;
  /** Adds a category and returns the option ID to select, or why it can't. */
  onCreateCategory: (name: string) => { id: string } | { error: string };
  /** Returns validation issues to keep the form open, or null once saved. */
  onSave: (values: SubscriptionFormValues) => ValidationIssues | null;
};

type ValidationIssues = {
  issues: Array<{ path: PropertyKey[]; message: string }>;
};

type SubscriptionFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collectionId: string;
  subscription?: SubscriptionRecord | null;
  review?: SubscriptionFormReviewMode;
  /** Starting values for a new subscription, such as a service picked from a list. */
  prefill?: SubscriptionFormPrefill;
  categories: CategoryOption[];
  onCreated?: () => void;
  /** Where focus goes when the dialog closes. Defaults to the trigger. */
  finalFocus?: React.ComponentProps<typeof DialogContent>['finalFocus'];
  /** Called once opening or closing, including its animation, finishes. */
  onOpenChangeComplete?: (open: boolean) => void;
};

type FormState = {
  name: string;
  iconRef: string;
  categoryId: string | null;
  cost: string;
  costFrequency: SubscriptionCostFrequency;
  nextInvoiceDate: string;
  notificationsIncluded: boolean;
};

function emptyForm(): FormState {
  return {
    name: '',
    iconRef: '',
    categoryId: null,
    cost: '',
    costFrequency: 'monthly',
    nextInvoiceDate: format(new Date(), 'yyyy-MM-dd'),
    notificationsIncluded: true,
  };
}

function formFromPrefill(
  prefill: SubscriptionFormPrefill,
  notificationsIncluded = true,
): FormState {
  return {
    name: prefill.name,
    iconRef: prefill.iconRef,
    categoryId: prefill.categoryId,
    cost:
      prefill.costAmount === null
        ? ''
        : formatCentsForInput(prefill.costAmount),
    costFrequency: prefill.costFrequency ?? 'monthly',
    nextInvoiceDate: prefill.nextInvoiceDate ?? '',
    notificationsIncluded,
  };
}

function getInitialForm(
  subscription: SubscriptionRecord | null | undefined,
  prefill: SubscriptionFormPrefill | undefined,
): FormState {
  if (prefill) {
    return formFromPrefill(prefill);
  }

  return subscription
    ? formFromPrefill(subscription, subscription.notificationsIncluded)
    : emptyForm();
}

export function SubscriptionFormDialog({
  open,
  finalFocus,
  onOpenChangeComplete,
  ...props
}: SubscriptionFormDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={props.onOpenChange}
      onOpenChangeComplete={onOpenChangeComplete}
    >
      <DialogContent className="sm:max-w-lg" finalFocus={finalFocus}>
        <SubscriptionForm {...props} />
      </DialogContent>
    </Dialog>
  );
}

/**
 * Mounts each time the dialog opens, so it starts from the prefill or the
 * subscription being edited.
 */
function SubscriptionForm({
  onOpenChange,
  collectionId,
  subscription,
  review,
  prefill: createPrefill,
  categories,
  onCreated,
}: Omit<
  SubscriptionFormDialogProps,
  'open' | 'finalFocus' | 'onOpenChangeComplete'
>) {
  const isEdit = Boolean(subscription) || Boolean(review);
  const status = review ? review.status : subscription?.status;
  const prefill = review?.prefill ?? createPrefill;
  const createSubscription = useCreateSubscription();
  const updateSubscription = useUpdateSubscription();
  const createCategory = useCreateCategory();
  const isPending =
    createSubscription.isPending || updateSubscription.isPending;

  const [form, setForm] = useState(() => getInitialForm(subscription, prefill));
  const [errors, setErrors] = useState<
    Partial<Record<keyof FormState, string>>
  >({});

  function update<Key extends keyof FormState>(
    key: Key,
    value: FormState[Key],
  ) {
    setForm((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => ({ ...previous, [key]: undefined }));
  }

  function handleCostChange(value: string) {
    update('cost', sanitizeCostInput(value));
  }

  function handleCostBlur() {
    setForm((previous) => ({
      ...previous,
      cost: normalizeCostInput(previous.cost),
    }));
  }

  function handleCreateCategory(name: string) {
    if (review) {
      const result = review.onCreateCategory(name);

      if ('error' in result) {
        setErrors((previous) => ({ ...previous, categoryId: result.error }));
      } else {
        update('categoryId', result.id);
      }

      return;
    }

    createCategory.mutate(
      { collectionId, name },
      {
        onSuccess: (category) => update('categoryId', category.id),
        onError: () => toast.error('Failed to add category'),
      },
    );
  }

  function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    const costAmount = parseCostToCents(form.cost);
    const nextErrors: Partial<Record<keyof FormState, string>> = {};

    if (costAmount === null) {
      nextErrors.cost = 'Enter a valid amount';
    } else if (costAmount > MAX_COST_AMOUNT_CENTS) {
      nextErrors.cost = 'Cost is too large';
    }

    if (!form.categoryId) {
      nextErrors.categoryId = 'Category is required';
    }

    // The null check also narrows costAmount to a number for the parses below.
    if (costAmount === null || Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    if (review) {
      const parsed = createSubscriptionInputSchema.safeParse({
        name: form.name,
        collectionId,
        iconRef: form.iconRef,
        categoryId: form.categoryId,
        costAmount,
        costFrequency: form.costFrequency,
        nextInvoiceDate: form.nextInvoiceDate,
      });

      if (!parsed.success) {
        applyZodErrors(parsed.error, setErrors);
        return;
      }

      const saveErrors = review.onSave({
        name: parsed.data.name,
        iconRef: parsed.data.iconRef,
        categoryId: parsed.data.categoryId,
        costAmount: parsed.data.costAmount,
        costFrequency: parsed.data.costFrequency,
        nextInvoiceDate: parsed.data.nextInvoiceDate,
      });

      if (saveErrors) {
        applyZodErrors(saveErrors, setErrors);
        return;
      }

      onOpenChange(false);

      return;
    }

    if (isEdit && subscription) {
      const parsed = updateSubscriptionInputSchema.safeParse({
        subscriptionId: subscription.id,
        name: form.name,
        iconRef: form.iconRef,
        categoryId: form.categoryId,
        costAmount,
        costFrequency: form.costFrequency,
        nextInvoiceDate: form.nextInvoiceDate,
        notificationsIncluded: form.notificationsIncluded,
      });

      if (!parsed.success) {
        applyZodErrors(parsed.error, setErrors);
        return;
      }

      updateSubscription.mutate(parsed.data, {
        onSuccess: () => {
          toast.success(`Updated “${form.name}”`);
          onOpenChange(false);
        },
        onError: () => toast.error('Failed to update subscription'),
      });

      return;
    }

    const parsed = createSubscriptionInputSchema.safeParse({
      name: form.name,
      collectionId,
      iconRef: form.iconRef,
      categoryId: form.categoryId,
      costAmount,
      costFrequency: form.costFrequency,
      nextInvoiceDate: form.nextInvoiceDate,
      notificationsIncluded: form.notificationsIncluded,
    });

    if (!parsed.success) {
      applyZodErrors(parsed.error, setErrors);
      return;
    }

    createSubscription.mutate(parsed.data, {
      onSuccess: () => {
        toast.success(`Added “${form.name}”`);
        onOpenChange(false);
        onCreated?.();
      },
      onError: () => toast.error('Failed to add subscription'),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-6">
      <DialogHeader>
        <DialogTitle>
          {isEdit ? 'Edit subscription' : 'Add subscription'}
        </DialogTitle>
        <DialogDescription>
          {review
            ? 'Changes apply to this import. Nothing is saved until you import.'
            : isEdit
              ? 'Update the details for this subscription.'
              : 'Track a new subscription in this collection.'}
        </DialogDescription>
      </DialogHeader>

      <Field data-invalid={errors.iconRef ? true : undefined}>
        <FieldLabel htmlFor="subscription-icon">Icon</FieldLabel>
        <IconPicker
          id="subscription-icon"
          value={form.iconRef}
          name={form.name}
          onChange={(domain) => update('iconRef', domain)}
          disabled={isPending}
          invalid={Boolean(errors.iconRef)}
        />
        <FieldError>{errors.iconRef}</FieldError>
      </Field>

      <Field data-invalid={errors.name ? true : undefined}>
        <FieldLabel htmlFor="subscription-name">Name</FieldLabel>
        <Input
          id="subscription-name"
          value={form.name}
          onChange={(event) => update('name', event.target.value)}
          placeholder="e.g. Netflix"
          aria-invalid={errors.name ? true : undefined}
          disabled={isPending}
        />
        <FieldError>{errors.name}</FieldError>
      </Field>

      <Field data-invalid={errors.categoryId ? true : undefined}>
        <FieldLabel htmlFor="subscription-category">Category</FieldLabel>
        <CategoryCombobox
          id="subscription-category"
          value={form.categoryId}
          onChange={(value) => update('categoryId', value)}
          onCreate={handleCreateCategory}
          categories={categories}
          invalid={Boolean(errors.categoryId)}
          disabled={isPending}
          creating={createCategory.isPending}
        />
        <FieldError>{errors.categoryId}</FieldError>
      </Field>

      <div className="grid gap-6 sm:grid-cols-2">
        <Field data-invalid={errors.cost ? true : undefined}>
          <FieldLabel htmlFor="subscription-cost">Cost</FieldLabel>
          <InputGroup data-disabled={isPending || undefined}>
            <InputGroupAddon>
              <InputGroupText>$</InputGroupText>
            </InputGroupAddon>
            <InputGroupInput
              id="subscription-cost"
              value={form.cost}
              onChange={(event) => handleCostChange(event.target.value)}
              onBlur={handleCostBlur}
              inputMode="decimal"
              placeholder="0.00"
              aria-invalid={errors.cost ? true : undefined}
              disabled={isPending}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupText>USD</InputGroupText>
            </InputGroupAddon>
          </InputGroup>
          <FieldError>{errors.cost}</FieldError>
        </Field>

        <Field>
          <FieldLabel htmlFor="subscription-frequency">
            Billing frequency
          </FieldLabel>
          <Select
            value={form.costFrequency}
            onValueChange={(value) =>
              update('costFrequency', value as SubscriptionCostFrequency)
            }
          >
            <SelectTrigger
              id="subscription-frequency"
              className="w-full"
              disabled={isPending}
            >
              <SelectValue>
                {(value) => formatFrequency(value as SubscriptionCostFrequency)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {FREQUENCY_OPTIONS.map((frequency) => (
                <SelectItem key={frequency} value={frequency}>
                  {formatFrequency(frequency)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <Field data-invalid={errors.nextInvoiceDate ? true : undefined}>
        <FieldLabel htmlFor="subscription-next-invoice">
          Next invoice
        </FieldLabel>
        <Popover>
          <PopoverTrigger
            render={
              <Button
                id="subscription-next-invoice"
                type="button"
                variant="outline"
                disabled={isPending}
                aria-invalid={errors.nextInvoiceDate ? true : undefined}
                className={cn(
                  'w-full justify-start gap-2 font-normal',
                  !form.nextInvoiceDate && 'text-muted-foreground',
                )}
              />
            }
          >
            <CalendarIcon className="size-4 text-muted-foreground" />
            {form.nextInvoiceDate
              ? formatInvoiceDate(form.nextInvoiceDate)
              : 'Pick a date'}
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-0">
            <Calendar
              mode="single"
              selected={
                form.nextInvoiceDate
                  ? parseISO(form.nextInvoiceDate)
                  : undefined
              }
              onSelect={(date) => {
                if (date) {
                  update('nextInvoiceDate', format(date, 'yyyy-MM-dd'));
                }
              }}
              autoFocus
            />
          </PopoverContent>
        </Popover>
        {status === 'inactive' && (
          <FieldDescription>
            Used to calculate the next invoice when reactivated.
          </FieldDescription>
        )}
        <FieldError>{errors.nextInvoiceDate}</FieldError>
      </Field>

      {/* Imports are included by default; the switch returns once saved. */}
      {review ? null : (
        <Field orientation="horizontal">
          <FieldContent>
            <FieldLabel htmlFor="subscription-notifications">
              Include in notifications
            </FieldLabel>
            <FieldDescription>
              Lets this subscription and its recorded invoices appear in
              reminders and overviews for this collection.
            </FieldDescription>
          </FieldContent>
          <Switch
            id="subscription-notifications"
            checked={form.notificationsIncluded}
            onCheckedChange={(checked) =>
              update('notificationsIncluded', checked)
            }
            disabled={isPending}
            aria-label="Include in notifications"
          />
        </Field>
      )}

      <DialogFooter>
        <DialogClose
          render={<Button variant="outline" type="button" />}
          disabled={isPending}
        >
          Cancel
        </DialogClose>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Add subscription'}
        </Button>
      </DialogFooter>
    </form>
  );
}

function applyZodErrors(
  error: ValidationIssues,
  setErrors: (errors: Partial<Record<keyof FormState, string>>) => void,
) {
  const nextErrors: Partial<Record<keyof FormState, string>> = {};

  for (const issue of error.issues) {
    const field = issue.path[0];

    if (field === 'costAmount') {
      nextErrors.cost = issue.message;
      continue;
    }

    // Review mode validates the category by name.
    if (field === 'category') {
      nextErrors.categoryId = issue.message;
      continue;
    }

    if (typeof field === 'string') {
      nextErrors[field as keyof FormState] = issue.message;
    }
  }

  setErrors(nextErrors);
}
