import { Outlet, createFileRoute } from '@tanstack/react-router';

import { requireSession } from '@/features/auth/require-session';

/**
 * Public routes render on the server (the router default). Everything under
 * this pathless layout uses `ssr: 'data-only'`: `beforeLoad` and loaders still
 * run on the server, so the session check and its redirect to `/login` happen
 * as an HTTP response, but components render on the client only. Child routes
 * inherit this setting, so new app routes need no extra setup.
 */
export const Route = createFileRoute('/_protected')({
  ssr: 'data-only',
  beforeLoad: async ({ location }) => {
    const session = await requireSession(location.href);

    return { user: session.user };
  },
  component: ProtectedLayout,
});

function ProtectedLayout() {
  return <Outlet />;
}
