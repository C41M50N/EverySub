import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Card, CardAction, CardHeader } from '@/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { SubscriptionIcon } from '@/features/subscriptions/components/subscription-icon';
import {
  buildUpcomingWindow,
  findNextInvoice,
  formatCurrencyFromCents,
  sumEffectiveMonthlyCents,
  sumEffectiveYearlyCents,
  type UpcomingWindow,
} from '@/features/subscriptions/cost';
import { formatInvoiceDistance } from '@/features/subscriptions/format';
import type { SubscriptionRecord } from '@/features/subscriptions/queries';

/** Horizon for the near-term cash-out metric. */
const DUE_WINDOW_DAYS = 30;

/** Brand marks shown before the stack collapses into a `+N` chip. */
const STACK_LIMIT = 4;

/** Rows listed in the stack's tooltip before it collapses into "and N more". */
const TOOLTIP_LIMIT = 10;

const LABEL_CLASS =
  'text-xs font-semibold uppercase tracking-widest text-muted-foreground';

type CostMetricsProps = {
  /** Rows currently passing the table's filters. */
  items: SubscriptionRecord[];
  /** The subset checked in the table; empty when there is no selection. */
  selectedItems: SubscriptionRecord[];
};

/**
 * Cost summary above the subscriptions table.
 *
 * The three cards deliberately answer to different inputs. Effective cost is a
 * calculator — narrowing it to a selection is the whole reason to select rows,
 * so it follows `selectedItems` when there is a selection. The schedule cards
 * report facts about the calendar: the next charge is the next charge whether
 * or not you happen to have three rows ticked, and a 30-day cash-out figure
 * that shrinks because of a checkbox is actively misleading. Both therefore
 * always read from `items`.
 *
 * Filters are treated differently from selection on purpose. A filter changes
 * what the page is about, so every card follows it; a selection is a transient
 * calculation over what is already on screen.
 */
export function CostMetrics({ items, selectedItems }: CostMetricsProps) {
  const isSelection = selectedItems.length > 0;
  const costItems = isSelection ? selectedItems : items;

  const monthlyCents = sumEffectiveMonthlyCents(costItems);
  const yearlyCents = sumEffectiveYearlyCents(costItems);
  const nextInvoice = findNextInvoice(items);
  const [now] = useState(() => new Date());
  const upcoming = buildUpcomingWindow(items, now, DUE_WINDOW_DAYS);

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Card size="sm">
        <CardHeader className="gap-0.5">
          <span className={LABEL_CLASS}>Effective cost</span>
          {/* Rendered only while a selection is active, so its presence is what
              signals that this card alone has narrowed. Omitted entirely rather
              than left empty, which would reserve a second header column. */}
          {isSelection ? (
            <CardAction>
              <Badge variant="secondary" className="tabular-nums">
                {selectedItems.length} selected
              </Badge>
            </CardAction>
          ) : null}
          <span className="font-heading text-3xl font-semibold tracking-tight tabular-nums">
            {formatCurrencyFromCents(monthlyCents)}
            <span className="ml-0.5 text-base font-normal text-muted-foreground">
              /mo
            </span>
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatCurrencyFromCents(yearlyCents)} per year
          </span>
        </CardHeader>
      </Card>

      <Card size="sm">
        <CardHeader className="gap-2">
          <span className={LABEL_CLASS}>Next payment</span>
          <div className="flex items-center gap-3">
            {nextInvoice ? (
              <SubscriptionIcon
                domain={nextInvoice.iconRef}
                name={nextInvoice.name}
                size="lg"
              />
            ) : null}
            <div className="min-w-0">
              <div className="font-heading text-2xl font-semibold tracking-tight tabular-nums">
                {nextInvoice
                  ? formatCurrencyFromCents(nextInvoice.costAmount)
                  : '—'}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {nextInvoice
                  ? `${nextInvoice.name} · ${formatInvoiceDistance(nextInvoice.nextInvoiceDate)}`
                  : 'Nothing scheduled'}
              </div>
            </div>
          </div>
        </CardHeader>
      </Card>

      <Card size="sm">
        <CardHeader className="gap-2">
          <span className={LABEL_CLASS}>Due in {DUE_WINDOW_DAYS} days</span>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="font-heading text-2xl font-semibold tracking-tight tabular-nums">
                {formatCurrencyFromCents(upcoming.totalCents)}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {dueCaption(upcoming)}
              </div>
            </div>
            <UpcomingIconStack window={upcoming} />
          </div>
        </CardHeader>
      </Card>
    </div>
  );
}

/**
 * "4 payments" — or "6 payments across 4 subscriptions" when something bills
 * more than once in the window, since those two numbers disagreeing is
 * otherwise confusing next to a list of four logos.
 */
function dueCaption(window: UpcomingWindow<SubscriptionRecord>): string {
  if (window.invoiceCount === 0) {
    return 'Nothing due';
  }

  const payments = `${window.invoiceCount} ${window.invoiceCount === 1 ? 'payment' : 'payments'}`;

  return window.invoiceCount === window.charges.length
    ? payments
    : `${payments} across ${window.charges.length} subscriptions`;
}

/**
 * Overlapping brand marks for the subscriptions billing in the window.
 *
 * The roster is unbounded in principle, so the row caps at four marks plus a
 * `+N` chip: the width stays fixed no matter how many subscriptions are
 * tracked, and the total beside it already carries the real answer. The full
 * list moves into a tooltip, itself capped, because a hover card naming eighty
 * services is no more readable than the stack it replaced.
 */
function UpcomingIconStack({
  window,
}: {
  window: UpcomingWindow<SubscriptionRecord>;
}) {
  const { charges } = window;

  if (charges.length === 0) {
    return null;
  }

  const visible = charges.slice(0, STACK_LIMIT);
  const overflow = charges.length - visible.length;
  const listed = charges.slice(0, TOOLTIP_LIMIT);
  const unlisted = charges.length - listed.length;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <div
            className="flex w-fit shrink-0 items-center"
            aria-label={`Billing in the next ${DUE_WINDOW_DAYS} days: ${charges.map((charge) => charge.item.name).join(', ')}`}
          />
        }
      >
        {visible.map((charge) => (
          // The card-coloured padding reads as a gap between overlapping marks;
          // SubscriptionIcon's own ring is inset and so cannot separate them.
          <span
            key={charge.item.id}
            className="-ml-2 rounded-[9px] bg-card p-0.5 first:ml-0"
          >
            <SubscriptionIcon
              domain={charge.item.iconRef}
              name={charge.item.name}
              size="md"
            />
          </span>
        ))}
        {overflow > 0 ? (
          <span className="-ml-2 rounded-[9px] bg-card p-0.5">
            <span className="flex size-8 items-center justify-center rounded-md bg-muted text-xs font-medium text-muted-foreground tabular-nums ring-1 ring-inset ring-border">
              +{overflow}
            </span>
          </span>
        ) : null}
      </TooltipTrigger>
      <TooltipContent className="max-w-72">
        <ul className="flex flex-col gap-0.5">
          {listed.map((charge) => (
            <li
              key={charge.item.id}
              className="flex items-baseline justify-between gap-4"
            >
              <span className="truncate">{charge.item.name}</span>
              <span className="shrink-0 tabular-nums opacity-75">
                {formatCurrencyFromCents(charge.totalCents)}
                {charge.occurrences > 1 ? ` (${charge.occurrences}×)` : ''}
              </span>
            </li>
          ))}
          {unlisted > 0 ? (
            <li className="opacity-75">and {unlisted} more</li>
          ) : null}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
}
