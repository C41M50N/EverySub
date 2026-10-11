import { Link } from '@tanstack/react-router';

import {
  ArrowRightIcon,
  CheckIcon,
  LockIcon,
} from '@/features/landing/components/icons';
import {
  arrowNudge,
  contentColumn,
  focusRing,
  landingButtonVariants,
  panelColumn,
} from '@/features/landing/styles';
import { track } from '@/lib/analytics';
import { cn } from '@/lib/utils';

const REASSURANCES = [
  'No bank connection needed',
  'Free plan, no card',
  'Open source',
];

export function Hero() {
  return (
    <section className="flex w-full flex-col items-center">
      <div
        className={cn(
          'flex flex-col items-center gap-7 pt-14 pb-12 sm:pt-24 sm:pb-18',
          contentColumn,
        )}
      >
        <a
          href="#smart-import"
          className={cn(
            'group flex items-center gap-2.5 rounded-full border border-line bg-white py-1.25 pr-3.5 pl-1.25',
            focusRing,
          )}
        >
          <span className="flex h-6 items-center rounded-full bg-brand-wash px-2.25 text-[13px]/4 font-semibold text-brand">
            New
          </span>
          <span className="text-sm/4.5 font-medium text-ink-soft">
            Smart import finds subscriptions
            <span className="max-sm:hidden"> in your bank statements</span>
          </span>
          <ArrowRightIcon
            className={cn('size-3.5 text-ink-muted', arrowNudge)}
          />
        </a>
        <div className="flex flex-col items-center gap-6 text-center">
          <h1 className="max-w-225 text-[44px]/12 tracking-[-0.045em] text-balance sm:text-[60px]/16 sm:text-wrap lg:text-[80px]/21">
            Know what you pay for, before it renews.
          </h1>
          <p className="max-w-160 text-lg/7 text-ink-muted sm:text-xl/7.75">
            EverySub keeps every subscription’s cost, renewal date, and billing
            history in one place. See what you’re committed to, what’s coming
            up, and what it all adds up to.
          </p>
        </div>
        <div className="flex w-full flex-col items-center gap-5 pt-2">
          <div className="flex w-full max-w-96 flex-col gap-3 sm:w-auto sm:max-w-none sm:flex-row">
            <Link
              to="/login"
              onClick={() =>
                track('cta_clicked', { location: 'hero', intent: 'start' })
              }
              className={landingButtonVariants({
                size: 'lg',
                className:
                  'shadow-[inset_0_1px_0_#FFFFFF24,0_1px_2px_#1018281F]',
              })}
            >
              Start tracking free
              <ArrowRightIcon className={cn('size-4', arrowNudge)} />
            </Link>
            <a
              href="#features"
              className={landingButtonVariants({
                variant: 'secondary',
                size: 'lg',
                className: 'shadow-[0_1px_2px_#1018280D]',
              })}
            >
              See how it works
            </a>
          </div>
          <ul className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            {REASSURANCES.map((reassurance) => (
              <li
                key={reassurance}
                className="flex items-center gap-1.5 text-sm/4.5 font-medium text-ink-muted"
              >
                <CheckIcon
                  strokeWidth={2.4}
                  className="size-3.75 shrink-0 text-brand"
                />
                {reassurance}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <ProductShot />
    </section>
  );
}

/**
 * The app window rises into the blue panel on load, which clips it. On narrow
 * screens the window keeps a readable size and runs off the panel's edge.
 */
function ProductShot() {
  return (
    <div
      className={cn(
        'flex overflow-clip rounded-[20px] bg-brand-glow px-4 pt-4 sm:rounded-[28px] sm:px-6 sm:pt-6 md:px-10 md:pt-10',
        panelColumn,
      )}
    >
      <div className="flex w-full max-w-280 min-w-160 shrink-0 flex-col overflow-clip rounded-t-[14px] border-x border-t border-white/20 bg-white shadow-[0_32px_72px_-16px_#0A1F3A59,0_2px_8px_#0A1F3A26] motion-safe:animate-product-rise">
        <div
          aria-hidden
          className="flex h-10 shrink-0 items-center justify-between border-b border-line-soft bg-[#FAFBFC] px-4"
        >
          <div className="flex w-20 gap-1.75">
            <span className="size-2.75 rounded-full bg-[#E2E5E9]" />
            <span className="size-2.75 rounded-full bg-[#E2E5E9]" />
            <span className="size-2.75 rounded-full bg-[#E2E5E9]" />
          </div>
          <div className="flex h-6 items-center gap-1.5 rounded-[7px] bg-[#F0F2F5] px-3 text-xs/4 font-medium text-ink-muted">
            <LockIcon strokeWidth={2.4} className="size-2.75 text-[#8A929C]" />
            everysub.app
          </div>
          <div className="w-20" />
        </div>
        <img
          src="/landing/screens/dashboard.webp"
          alt="The EverySub dashboard for a Personal collection: $406.39 a month across 30 subscriptions, spending over time, spend by category, and upcoming invoices."
          width={1120}
          height={700}
          fetchPriority="high"
          className="h-auto w-full"
        />
      </div>
    </div>
  );
}
