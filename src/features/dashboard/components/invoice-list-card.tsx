import { Link } from '@tanstack/react-router';
import { ArrowRightIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import type { InvoiceItem, InvoiceView } from '@/features/invoices/domain';
import { SubscriptionIcon } from '@/features/subscriptions/components/subscription-icon';
import { formatCurrencyFromCents } from '@/features/subscriptions/cost';
import { formatInvoiceDistance } from '@/features/subscriptions/format';

type InvoiceListCardProps = {
  title: string;
  description: string;
  /** Which Invoices page view the "View all" link opens. */
  view: InvoiceView;
  collectionId: string;
  invoices: InvoiceItem[];
  emptyMessage: string;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  now: Date;
};

/**
 * Compact invoice list shared by the upcoming and recently recorded cards.
 *
 * Rows are intentionally denser than the Invoices table: icon, name, relative
 * date, amount. Anything more belongs on the Invoices page the header links to.
 * The list scrolls past a fixed height so a busy window can't stretch the card,
 * and shrinks below it when the card is given less room.
 */
export function InvoiceListCard({
  title,
  description,
  view,
  collectionId,
  invoices,
  emptyMessage,
  isLoading = false,
  isError = false,
  onRetry,
  now,
}: InvoiceListCardProps) {
  return (
    <Card className="min-h-0 gap-0 py-0">
      <CardHeader className="shrink-0 border-b py-4">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
        <CardAction className="self-center">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            nativeButton={false}
            render={
              <Link
                to="/c/$collectionId/invoices"
                params={{ collectionId }}
                search={view === 'history' ? { view: 'history' } : {}}
              />
            }
          >
            View all
            <ArrowRightIcon data-icon="inline-end" />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col p-0">
        {isLoading ? (
          <div className="space-y-1 p-2">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="flex items-center gap-3 px-2 py-2">
                <Skeleton className="size-8 rounded-md" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="h-3 w-20" />
                </div>
                <Skeleton className="h-3.5 w-14" />
              </div>
            ))}
          </div>
        ) : isError ? (
          <EmptyRows>
            <p>Recorded history is unavailable.</p>
            {onRetry ? (
              <button
                type="button"
                className="mt-1 text-sm font-medium text-destructive underline underline-offset-4"
                onClick={onRetry}
              >
                Retry history
              </button>
            ) : null}
          </EmptyRows>
        ) : invoices.length === 0 ? (
          <EmptyRows>{emptyMessage}</EmptyRows>
        ) : (
          <ScrollArea className="max-h-80 min-h-0 flex-1">
            <ul className="space-y-1 p-2">
              {invoices.map((invoice) => (
                <li
                  key={invoice.id}
                  className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted/50"
                >
                  <SubscriptionIcon
                    domain={invoice.iconRef}
                    name={invoice.name}
                    size="md"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {invoice.name}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {formatInvoiceDistance(invoice.date, now)}
                      {' · '}
                      {invoice.category}
                    </div>
                  </div>
                  <span
                    className="text-sm font-medium tabular-nums"
                    aria-label={`${(invoice.amount / 100).toFixed(2)} US dollars`}
                  >
                    {formatCurrencyFromCents(invoice.amount)}
                  </span>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyRows({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-40 flex-1 place-items-center px-6 text-center text-sm text-muted-foreground">
      <div>{children}</div>
    </div>
  );
}
