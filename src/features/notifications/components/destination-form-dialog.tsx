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
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  useCreateWebhookDestination,
  useUpdateDestination,
} from '@/features/notifications/mutations';
import type { DestinationRecord } from '@/features/notifications/queries';
import {
  destinationNameSchema,
  webhookDestinationTypeSchema,
} from '@/features/notifications/schema';
import { checkWebhookUrl } from '@/features/notifications/url-safety';
import type { NotificationDestinationType } from '@/lib/db/notification-schema';

type WebhookType = 'webhook' | 'discord';

const COPY: Record<
  WebhookType,
  {
    title: string;
    description: string;
    urlLabel: string;
    placeholder: string;
    urlHelp: string;
    namePlaceholder: string;
  }
> = {
  discord: {
    title: 'Add a Discord webhook',
    description:
      'Posts readable reminders and overviews to a Discord channel. Create the webhook in Discord under Channel settings → Integrations → Webhooks.',
    urlLabel: 'Webhook URL',
    placeholder: 'https://discord.com/api/webhooks/…',
    urlHelp:
      'Anyone with this URL can post to the channel, so EverySub stores it as a secret and only shows its last characters.',
    namePlaceholder: 'e.g. Family server',
  },
  webhook: {
    title: 'Add a webhook',
    description:
      'Sends signed JSON events to your own HTTPS endpoint. Each event has a stable ID for deduplication.',
    urlLabel: 'Endpoint URL',
    placeholder: 'https://example.com/hooks/everysub',
    urlHelp:
      'Must be a public HTTPS address. EverySub doesn’t follow redirects or send to private networks.',
    namePlaceholder: 'e.g. Home automation',
  },
};

type DestinationFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
} & (
  | {
      /** Adds a webhook destination of this type. */
      type: WebhookType;
      destination?: undefined;
      onCreated?: (result: {
        signingSecret: string | null;
        name: string;
      }) => void;
    }
  | {
      /** Edits an existing destination. Email can only be renamed. */
      type?: undefined;
      destination: DestinationRecord | null;
      onCreated?: undefined;
    }
);

/** Adds a Discord or generic webhook, or edits any destination. */
export function DestinationFormDialog({
  open,
  ...props
}: DestinationFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DestinationForm {...props} />
      </DialogContent>
    </Dialog>
  );
}

/**
 * Mounts each time the dialog opens, so it starts from the destination's saved
 * name and an empty URL.
 */
function DestinationForm({
  onOpenChange,
  type: createType,
  destination,
  onCreated,
}: Omit<DestinationFormDialogProps, 'open'>) {
  const createDestination = useCreateWebhookDestination();
  const updateDestination = useUpdateDestination();
  const isEdit = Boolean(destination);
  const isPending = createDestination.isPending || updateDestination.isPending;
  const type: NotificationDestinationType =
    destination?.type ?? createType ?? 'webhook';
  const copy = type === 'email' ? null : COPY[type];

  const [name, setName] = useState(destination?.name ?? '');
  const [url, setUrl] = useState('');
  const [errors, setErrors] = useState<{ name?: string; url?: string }>({});

  function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsedName = destinationNameSchema.safeParse(name);
    const nextErrors: typeof errors = {};

    if (!parsedName.success) {
      nextErrors.name = parsedName.error.issues[0]?.message;
    }

    // Editing keeps the saved URL unless a new one is entered.
    const urlCheck =
      type === 'email' || (isEdit && url.trim() === '')
        ? null
        : checkWebhookUrl(url, type);

    if (urlCheck && !urlCheck.ok) {
      nextErrors.url = urlCheck.message;
    }

    if (!parsedName.success || nextErrors.url) {
      setErrors(nextErrors);
      return;
    }

    const onError = (error: Error) => {
      setErrors({ url: error.message });
      toast.error(
        isEdit
          ? 'Failed to save the destination'
          : 'Failed to add the destination',
      );
    };

    if (destination) {
      updateDestination.mutate(
        {
          destinationId: destination.id,
          name: parsedName.data,
          url: url.trim() || undefined,
        },
        {
          onSuccess: () => {
            toast.success(`Saved “${parsedName.data}”`);
            onOpenChange(false);
          },
          onError,
        },
      );
      return;
    }

    createDestination.mutate(
      {
        type: webhookDestinationTypeSchema.parse(createType),
        name: parsedName.data,
        url: url.trim(),
      },
      {
        onSuccess: (result) => {
          toast.success(`Added “${parsedName.data}”`);
          onOpenChange(false);
          onCreated?.({
            signingSecret: result.signingSecret,
            name: parsedName.data,
          });
        },
        onError,
      },
    );
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-6" noValidate>
      <DialogHeader>
        <DialogTitle>
          {isEdit ? `Edit ${destination?.name ?? 'destination'}` : copy?.title}
        </DialogTitle>
        <DialogDescription>
          {type === 'email'
            ? 'Rename this destination. Email always goes to your verified account address.'
            : isEdit
              ? 'Rename this destination or replace its URL.'
              : `${copy?.description} Adding it doesn’t send anything until a collection routes notifications here.`}
        </DialogDescription>
      </DialogHeader>

      <Field data-invalid={errors.name ? true : undefined}>
        <FieldLabel htmlFor="destination-name">Name</FieldLabel>
        <Input
          id="destination-name"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setErrors((previous) => ({ ...previous, name: undefined }));
          }}
          placeholder={copy?.namePlaceholder}
          aria-invalid={errors.name ? true : undefined}
          disabled={isPending}
          autoFocus
        />
        <FieldError>{errors.name}</FieldError>
      </Field>

      {copy ? (
        <Field data-invalid={errors.url ? true : undefined}>
          <FieldLabel htmlFor="destination-url">
            {isEdit ? `New ${copy.urlLabel.toLowerCase()}` : copy.urlLabel}
          </FieldLabel>
          <Input
            id="destination-url"
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            value={url}
            onChange={(event) => {
              setUrl(event.target.value);
              setErrors((previous) => ({ ...previous, url: undefined }));
            }}
            placeholder={
              isEdit
                ? `Leave blank to keep ${destination?.target ?? 'the saved URL'}`
                : copy.placeholder
            }
            aria-invalid={errors.url ? true : undefined}
            disabled={isPending}
          />
          <FieldDescription>{copy.urlHelp}</FieldDescription>
          <FieldError>{errors.url}</FieldError>
        </Field>
      ) : null}

      <DialogFooter>
        <DialogClose
          render={<Button variant="outline" type="button" />}
          disabled={isPending}
        >
          Cancel
        </DialogClose>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Add destination'}
        </Button>
      </DialogFooter>
    </form>
  );
}
