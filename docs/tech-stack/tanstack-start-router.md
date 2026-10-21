# TanStack Start + Router

## Not Found handling

The app configures a root-level `notFoundComponent` in `src/routes/__root.tsx` to provide a consistent 404 page and avoid TanStack Router's generic fallback warning.

When a route does not match, TanStack Router renders this component instead of the default `<p>Not Found</p>` output.

Use TanStack Router's `Link` component for internal navigation (for example, the Not Found page links back home via `<Link to="/">`).

## Query integration

TanStack Query is wired into Router SSR in `src/router.tsx`.

See [TanStack Start x Query](./tanstack-start-query.md) for route data conventions.

## Rendering

Public routes (`/`, `/login`, the 404 page) are server-rendered. That is TanStack Router's default, so a new public page needs no extra configuration.

The signed-in app's components render on the client. `src/routes/_protected/route.tsx` sets `ssr: 'data-only'`, and TanStack Router applies that setting to every child route, so anything placed under `_protected` is client-rendered automatically. On the initial request the server still runs `beforeLoad` and loaders for the protected routes, so the session check happens on the server and an unauthenticated visitor gets an HTTP redirect to `/login`. The server renders the `<html>` shell and the root layout, sends the `beforeLoad` context and loader data along, and the browser renders the page.

Two alternatives if you need them:

- `ssr: false` on `_protected` moves `beforeLoad` and loaders to the client as well. The server then sends the shell for every protected URL and the redirect happens after hydration.
- A `pendingComponent` on `_protected` is what the server renders in place of the client-only subtree. Without one, that area is empty until hydration.

SPA mode (`spa: { enabled: true }` in `vite.config.ts`) is intentionally off. It replaces server rendering for every route with a static shell, which is the opposite of what the public pages need.
