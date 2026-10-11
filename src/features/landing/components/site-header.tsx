import { Link } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';

import { Wordmark } from '@/features/landing/components/wordmark';
import {
  contentColumn,
  focusRing,
  landingButtonVariants,
} from '@/features/landing/styles';
import { track } from '@/lib/analytics';
import { cn } from '@/lib/utils';

const NAV_LINKS = [
  { label: 'Features', href: '#features' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'FAQ', href: '#faq' },
];

export function SiteHeader() {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);

  // The header gains its bottom border once this 1px marker at the top of the
  // page scrolls out of view.
  useEffect(() => {
    const sentinel = sentinelRef.current;

    if (!sentinel) {
      return;
    }

    const observer = new IntersectionObserver(([entry]) => {
      setScrolled(!entry.isIntersecting);
    });

    observer.observe(sentinel);

    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div
        ref={sentinelRef}
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
      />
      <header
        data-scrolled={scrolled ? '' : undefined}
        className="sticky top-0 z-50 flex w-full justify-center border-b border-transparent bg-[#FFFFFFDB] backdrop-blur-md backdrop-saturate-140 transition-[border-color] duration-200 ease-reveal data-scrolled:border-line-soft"
      >
        <nav
          aria-label="Main"
          className={cn(
            'flex h-16 items-center justify-between sm:h-18',
            contentColumn,
          )}
        >
          <Link
            to="/"
            className={cn('flex shrink-0 rounded-md md:w-55', focusRing)}
          >
            <Wordmark />
          </Link>
          {/* Hidden on small screens, where the footer links to the same
              sections. */}
          <ul className="hidden items-center gap-9 text-[15px]/4.5 font-medium md:flex">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className={cn(
                    'rounded-sm text-ink-soft transition-colors duration-150 ease-reveal hover:text-ink',
                    focusRing,
                  )}
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
          <div className="flex shrink-0 items-center justify-end gap-4 sm:gap-5 md:w-55">
            <Link
              to="/login"
              onClick={() =>
                track('cta_clicked', { location: 'header', intent: 'sign_in' })
              }
              className={cn(
                'rounded-sm text-[15px]/4.5 font-medium text-ink-soft transition-colors duration-150 ease-reveal hover:text-ink',
                focusRing,
              )}
            >
              Sign in
            </Link>
            <Link
              to="/login"
              onClick={() =>
                track('cta_clicked', { location: 'header', intent: 'start' })
              }
              className={landingButtonVariants({ size: 'sm' })}
            >
              Get started
            </Link>
          </div>
        </nav>
      </header>
    </>
  );
}
