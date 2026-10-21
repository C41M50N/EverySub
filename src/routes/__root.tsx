import { TanStackDevtools } from '@tanstack/react-devtools';
import type { QueryClient } from '@tanstack/react-query';
import { ReactQueryDevtoolsPanel } from '@tanstack/react-query-devtools';
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRouteWithContext,
  type ErrorComponentProps,
} from '@tanstack/react-router';
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools';
import { ThemeProvider } from 'next-themes';

import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { NotFoundPage } from '@/features/landing/components/not-found-page';
import { umamiScript, usePageviewTracking } from '@/lib/analytics';

import appCss from '../styles.css?url';

interface MyRouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'EverySub — Track and manage your subscriptions',
      },
    ],
    links: [
      {
        rel: 'icon',
        type: 'image/svg+xml',
        href: '/favicon.svg',
      },
      {
        rel: 'stylesheet',
        href: appCss,
      },
    ],
    scripts: [umamiScript],
  }),
  notFoundComponent: NotFoundPage,
  errorComponent: RootError,
  shellComponent: RootDocument,
  component: RootLayout,
});

function RootLayout() {
  return <Outlet />;
}

function RootDocument({ children }: { children: React.ReactNode }) {
  usePageviewTracking();

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster />
        </ThemeProvider>
        <TanStackDevtools
          config={{
            position: 'bottom-right',
          }}
          plugins={[
            {
              name: 'Tanstack Router',
              render: <TanStackRouterDevtoolsPanel />,
            },
            {
              name: 'Tanstack Query',
              render: <ReactQueryDevtoolsPanel />,
            },
          ]}
        />
        <Scripts />
      </body>
    </html>
  );
}

function RootError({ error, reset }: ErrorComponentProps) {
  const message = error instanceof Error ? error.message : 'Unexpected error';

  return (
    <div className="mx-auto flex min-h-[50vh] w-full max-w-2xl flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-red-500/80">
        Error
      </p>
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="text-base leading-7 text-slate-600">
        Try again or head back home. If the problem persists, contact support.
      </p>
      <div className="w-full rounded-md border border-black/10 bg-white/80 p-4 text-left text-sm text-slate-600">
        {message}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button variant="outline" onClick={reset}>
          Try again
        </Button>
        <Link
          className="text-sm font-medium underline underline-offset-4"
          to="/"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
