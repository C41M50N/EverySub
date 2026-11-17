import { Wordmark } from '@/features/landing/components/wordmark';
import { contentColumn, focusRing } from '@/features/landing/styles';
import { cn } from '@/lib/utils';

const REPOSITORY_URL = 'https://github.com/C41M50N/SubTrack';

const LINK_GROUPS = [
  {
    title: 'Product',
    links: [
      { label: 'Features', href: '#features' },
      { label: 'Pricing', href: '#pricing' },
      { label: 'Changelog', href: `${REPOSITORY_URL}/commits/main` },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'GitHub', href: REPOSITORY_URL },
      {
        label: 'Webhook docs',
        href: `${REPOSITORY_URL}/blob/main/docs/notifications/webhooks.md`,
      },
      { label: 'FAQ', href: '#faq' },
      { label: 'Contact', href: 'mailto:hello@everysub.app' },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="flex w-full flex-col items-center gap-12 border-t border-line-soft bg-[#F7F8FA] pt-14 pb-10 md:gap-14 md:pt-18">
      <div
        className={cn(
          'flex flex-col gap-10 md:flex-row md:justify-between',
          contentColumn,
        )}
      >
        <div className="flex max-w-70 shrink-0 flex-col gap-4">
          <Wordmark />
          <p className="text-[15px]/6 text-ink-muted">
            Subscription costs and renewals, easy to understand and act on.
          </p>
        </div>
        <nav aria-label="Footer" className="flex gap-16">
          {LINK_GROUPS.map((group) => (
            <div
              key={group.title}
              className="flex w-27.5 shrink-0 flex-col gap-3.5"
            >
              <h2 className="text-sm/4.5 font-semibold">{group.title}</h2>
              <ul className="flex flex-col gap-3.5 text-sm/4.5">
                {group.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className={cn(
                        'rounded-sm text-ink-muted transition-colors duration-150 ease-reveal hover:text-ink',
                        focusRing,
                      )}
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>
      <div
        className={cn(
          'flex items-center justify-between gap-6 border-t border-line pt-7',
          contentColumn,
        )}
      >
        <p className="text-sm/4.5 text-ink-muted">
          {/* oxlint-disable-next-line react/purity -- Only the year is read, so a stale or mismatched value is limited to New Year's. */}
          © {new Date().getFullYear()} EverySub. Open source and built in
          public.
        </p>
        <a
          href={REPOSITORY_URL}
          aria-label="EverySub on GitHub"
          className={cn(
            'rounded-sm opacity-70 transition-opacity duration-150 ease-reveal hover:opacity-100',
            focusRing,
          )}
        >
          <img src="/landing/logos/github.svg" alt="" className="size-4.5" />
        </a>
      </div>
    </footer>
  );
}

/** The single-row footer of the standalone pages, like sign-in and 404. */
export function CompactFooter({ className }: { className?: string }) {
  return (
    <footer
      className={cn(
        'flex h-10 shrink-0 items-center justify-between gap-6 text-[13px]/4',
        className,
      )}
    >
      <p className="text-[#6B7380]">
        {/* oxlint-disable-next-line react/purity -- Only the year is read, so a stale or mismatched value is limited to New Year's. */}
        © {new Date().getFullYear()} EverySub
      </p>
      <a
        href={REPOSITORY_URL}
        className={cn(
          'rounded-sm font-medium text-ink-muted transition-colors duration-150 ease-reveal hover:text-ink',
          focusRing,
        )}
      >
        GitHub
      </a>
    </footer>
  );
}
