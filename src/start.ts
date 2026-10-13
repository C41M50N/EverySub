import { createCsrfMiddleware, createStart } from '@tanstack/react-start';

/**
 * The app renders on the client. Public pages opt back into SSR with
 * `ssr: true`, which the root route has to set too because a route can't
 * render on the server when its parent doesn't.
 */
export const startInstance = createStart(() => ({
  defaultSsr: false,
  requestMiddleware: [
    createCsrfMiddleware({
      filter: (ctx) => ctx.handlerType === 'serverFn',
    }),
  ],
}));
