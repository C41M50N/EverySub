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
import { useCreateEmailDestination } from '@/features/notifications/mutations';
import { destinationNameSchema } from '@/features/notifications/schema';

type EmailDestinationDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountEmail: string;
};

export function EmailDestinationDialog({
  open,
  ...props
}: EmailDestinationDialogProps) {
  return (
    <Dialog open={open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <EmailDestinationForm {...props} />
      </DialogContent>
    </Dialog>
  );
}

/** Mounts each time the dialog opens, so it starts from the default name. */
function EmailDestinationForm({
  onOpenChange,
  accountEmail,
}: Omit<EmailDestinationDialogProps, 'open'>) {
  const createDestination = useCreateEmailDestination();
  const [name, setName] = useState('Email');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsed = destinationNameSchema.safeParse(name);

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Name is required');
      return;
    }

    createDestination.mutate(parsed.data, {
      onSuccess: () => {
        toast.success('Email added as a destination');
        onOpenChange(false);
      },
      onError: (mutationError) => {
        setError(mutationError.message);
        toast.error('Failed to add email');
      },
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-6">
      <DialogHeader>
        <DialogTitle>Add email</DialogTitle>
        <DialogDescription>
          Notifications go to your verified account email,{' '}
          <span className="font-medium text-foreground">{accountEmail}</span>.
          If you change that address, email pauses until the new one is
          verified. Adding email doesn’t send anything until a collection routes
          notifications to it.
        </DialogDescription>
      </DialogHeader>
      <Field data-invalid={error ? true : undefined}>
        <FieldLabel htmlFor="email-destination-name">Name</FieldLabel>
        <Input
          id="email-destination-name"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
          aria-invalid={error ? true : undefined}
          disabled={createDestination.isPending}
        />
        <FieldError>{error}</FieldError>
      </Field>
      <DialogFooter>
        <DialogClose
          render={<Button variant="outline" type="button" />}
          disabled={createDestination.isPending}
        >
          Cancel
        </DialogClose>
        <Button type="submit" disabled={createDestination.isPending}>
          {createDestination.isPending ? 'Adding…' : 'Add email'}
        </Button>
      </DialogFooter>
    </form>
  );
}
