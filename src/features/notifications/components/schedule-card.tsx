import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TimeZoneCombobox } from '@/features/notifications/components/time-zone-combobox';
import { useSaveNotificationSchedule } from '@/features/notifications/mutations';
import { saveNotificationScheduleInputSchema } from '@/features/notifications/schema';
import {
  FALLBACK_TIME_ZONE,
  getBrowserTimeZone,
  getTimeZoneAbbreviation,
} from '@/features/notifications/time';
import {
  DEFAULT_REMINDER_LEAD_DAYS,
  MAX_REMINDER_LEAD_DAYS,
  MIN_REMINDER_LEAD_DAYS,
} from '@/lib/db/notification-schema';

const LEAD_DAY_OPTIONS = Array.from(
  { length: MAX_REMINDER_LEAD_DAYS - MIN_REMINDER_LEAD_DAYS + 1 },
  (_, index) => MIN_REMINDER_LEAD_DAYS + index,
);

function formatLeadDays(days: number) {
  return `${days} ${days === 1 ? 'day' : 'days'} before`;
}

type Schedule = { timeZone: string; reminderLeadDays: number };

export function ScheduleCard({ schedule }: { schedule: Schedule | null }) {
  const saveSchedule = useSaveNotificationSchedule();
  // Before the first save, suggest the browser's zone. This page only renders
  // on the client, so it's known on the first render.
  const [timeZone, setTimeZone] = useState(
    () => schedule?.timeZone ?? getBrowserTimeZone() ?? FALLBACK_TIME_ZONE,
  );
  const [leadDays, setLeadDays] = useState(
    schedule?.reminderLeadDays ?? DEFAULT_REMINDER_LEAD_DAYS,
  );
  const [error, setError] = useState<string | null>(null);
  const isSetUp = schedule !== null;

  const isDirty =
    !isSetUp ||
    timeZone !== schedule.timeZone ||
    leadDays !== schedule.reminderLeadDays;
  const zoneLabel = timeZone
    ? `${timeZone} (${getTimeZoneAbbreviation(timeZone)})`
    : 'your time zone';

  function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsed = saveNotificationScheduleInputSchema.safeParse({
      timeZone,
      reminderLeadDays: leadDays,
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check your schedule');
      return;
    }

    setError(null);
    saveSchedule.mutate(parsed.data, {
      onSuccess: () =>
        toast.success(isSetUp ? 'Schedule saved' : 'Notifications set up'),
      onError: (mutationError) => {
        setError(mutationError.message);
        toast.error('Failed to save your schedule');
      },
    });
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="contents">
        <CardHeader>
          <CardTitle>{isSetUp ? 'Schedule' : 'Set up notifications'}</CardTitle>
          <CardDescription>
            {isSetUp
              ? 'Every notification sends at 9:00 AM in your time zone, which also sets the day each invoice is recorded.'
              : 'Choose your time zone to start scheduling notifications. Every notification sends at 9:00 AM local time.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="gap-6">
            <Field data-invalid={error ? true : undefined}>
              <FieldLabel htmlFor="notification-time-zone">
                Time zone
              </FieldLabel>
              <TimeZoneCombobox
                id="notification-time-zone"
                value={timeZone}
                onChange={(next) => {
                  setTimeZone(next);
                  setError(null);
                }}
                disabled={saveSchedule.isPending}
                invalid={Boolean(error)}
              />
              {!isSetUp ? (
                <FieldDescription>
                  Suggested from this browser. Change it if you usually live
                  somewhere else.
                </FieldDescription>
              ) : null}
              <FieldError>{error}</FieldError>
            </Field>
            <Field>
              <FieldLabel htmlFor="notification-lead-days">
                Renewal reminders
              </FieldLabel>
              <Select
                value={leadDays}
                onValueChange={(value) => setLeadDays(Number(value))}
              >
                <SelectTrigger
                  id="notification-lead-days"
                  className="w-full sm:w-64"
                  disabled={saveSchedule.isPending}
                >
                  <SelectValue>
                    {(value) => `${formatLeadDays(Number(value))} each charge`}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {LEAD_DAY_OPTIONS.map((days) => (
                    <SelectItem key={days} value={days}>
                      {formatLeadDays(days)} each charge
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>
                Applies to every collection and destination.
              </FieldDescription>
            </Field>
          </FieldGroup>
          {isSetUp && isDirty ? (
            <p className="mt-6 rounded-lg bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
              Changes apply to reminders that haven’t been sent yet. A reminder
              whose new time has already passed is skipped rather than sent
              late.
            </p>
          ) : null}
        </CardContent>
        <CardFooter className="flex flex-wrap items-center justify-between gap-3 border-t">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            Reminders: 9:00 AM {zoneLabel}, {formatLeadDays(leadDays)} each
            expected charge. Overviews: 9:00 AM on the 1st.
          </p>
          <Button type="submit" disabled={!isDirty || saveSchedule.isPending}>
            {saveSchedule.isPending
              ? 'Saving…'
              : isSetUp
                ? 'Save schedule'
                : 'Turn on scheduling'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
