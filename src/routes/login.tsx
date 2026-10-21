import { Link, createFileRoute, redirect } from '@tanstack/react-router';
import { useState } from 'react';

import { Spinner } from '@/components/ui/spinner';
import { authClient } from '@/features/auth/client';
import { getSession } from '@/features/auth/session';
import {
  ArrowLeftIcon,
  CheckIcon,
  GoogleIcon,
} from '@/features/landing/components/icons';
import { LoginShowcase } from '@/features/landing/components/login-showcase';
import { CompactFooter } from '@/features/landing/components/site-footer';
import { Wordmark } from '@/features/landing/components/wordmark';
import { focusRing, landingButtonVariants } from '@/features/landing/styles';
import { cn } from '@/lib/utils';

type LoginSearch = {
  redirect?: string;
};

const FALLBACK_REDIRECT = '/dashboard';

function getSafeRedirect(redirectTo?: string) {
  if (!redirectTo) {
    return FALLBACK_REDIRECT;
  }

  if (!redirectTo.startsWith('/') || redirectTo.startsWith('//')) {
    return FALLBACK_REDIRECT;
  }

  return redirectTo;
}

export const Route = createFileRoute('/login')({
  head: () => ({ meta: [{ title: 'Sign in · EverySub' }] }),
  validateSearch: (search): LoginSearch => ({
    redirect: typeof search.redirect === 'string' ? search.redirect : undefined,
  }),
  beforeLoad: async ({ search }) => {
    const session = await getSession();

    if (session) {
      throw redirect({
        href: getSafeRedirect(search.redirect),
      });
    }
  },
  component: Login,
});

const PROMISES = [
  'We only read your name and email from Google',
  'No bank connection, ever',
];

function Login() {
  const search = Route.useSearch();
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    setIsPending(true);
    setErrorMessage(null);

    const callbackURL = getSafeRedirect(search.redirect);
    const { error } = await authClient.signIn.social({
      provider: 'google',
      callbackURL,
    });

    if (error) {
      setIsPending(false);
      setErrorMessage(error.message || 'Unable to sign in right now.');
    }
  };

  return (
    <div className="flex min-h-dvh bg-white text-ink scheme-light lg:p-4">
      <div className="flex grow flex-col justify-between gap-12 px-5 py-4 sm:px-10 sm:py-6">
        <header className="flex h-10 shrink-0 items-center justify-between gap-6">
          <Link to="/" className={cn('flex rounded-md', focusRing)}>
            <Wordmark />
          </Link>
          <Link
            to="/"
            className={cn(
              'group flex items-center gap-1.5 rounded-sm text-sm/4.5 font-medium text-ink-soft transition-colors duration-150 ease-reveal hover:text-ink',
              focusRing,
            )}
          >
            <ArrowLeftIcon className="size-3.5 shrink-0 text-ink-muted transition-[translate] duration-150 ease-reveal motion-safe:group-hover:-translate-x-0.5 motion-safe:group-focus-visible:-translate-x-0.5" />
            Back to site
          </Link>
        </header>
        <main className="flex justify-center">
          <div className="flex w-full max-w-95 flex-col gap-10">
            <div className="flex flex-col gap-3.5">
              <h1 className="text-[44px]/12 tracking-[-0.045em] sm:text-[56px]/15">
                Welcome back.
              </h1>
              <p className="text-[17px]/6.5 text-ink-muted">
                Sign in to see what’s renewing next and what it all adds up to.
              </p>
            </div>
            <div className="flex flex-col gap-4">
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isPending}
                className={landingButtonVariants({
                  variant: 'secondary',
                  size: 'xl',
                  className:
                    'w-full gap-3 shadow-[0_1px_2px_#1018280D] disabled:pointer-events-none',
                })}
              >
                {isPending ? (
                  <Spinner className="size-5 text-ink-muted" />
                ) : (
                  <GoogleIcon className="size-5 shrink-0" />
                )}
                Continue with Google
              </button>
              {errorMessage ? (
                <p role="alert" className="text-sm/5.25 text-[#B42318]">
                  {errorMessage}
                </p>
              ) : (
                <p className="text-sm/5.25 text-ink-muted">
                  New here? The same button creates your free account.
                </p>
              )}
            </div>
            <ul className="flex flex-col gap-3.5 border-t border-line-soft pt-7">
              {PROMISES.map((promise) => (
                <li
                  key={promise}
                  className="flex items-start gap-2.5 text-sm/5 font-medium text-ink-soft"
                >
                  <CheckIcon
                    strokeWidth={2.4}
                    className="mt-0.5 size-4 shrink-0 text-brand"
                  />
                  {promise}
                </li>
              ))}
            </ul>
          </div>
        </main>
        <CompactFooter />
      </div>
      <LoginShowcase className="hidden shrink-0 lg:flex lg:w-1/2 xl:w-170" />
    </div>
  );
}
