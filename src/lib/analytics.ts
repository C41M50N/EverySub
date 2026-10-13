import { useRouter, useRouterState } from '@tanstack/react-router';
import { useEffect } from 'react';

/**
 * Product analytics through a self-hosted Umami instance. The tracker only
 * reports from the production domain, so local and preview traffic is dropped
 * by the script itself.
 *
 * Every payload is built here rather than by the tracker: URLs are reported as
 * route templates (`/c/$collectionId/dashboard`), so IDs and search state never
 * leave the app, and signed-in activity carries the opaque user ID as Umami's
 * distinct ID. Event data never includes names, amounts, or anything typed.
 */
export const umamiScript = {
  src: 'https://umami-production-d13c.up.railway.app/script.js',
  defer: true,
  'data-website-id': '6996e1a7-dcb3-43c5-9070-aa5b228ca9e6',
  'data-domains': 'everysub.app',
  // Pageviews are sent by `usePageviewTracking` with the route template.
  'data-auto-pageview': 'false',
};

type AnalyticsEvents = {
  cta_clicked: {
    location: 'header' | 'hero' | 'pricing' | 'closing';
    intent: 'start' | 'sign_in';
    plan?: string;
  };
  account_set_up: undefined;
  subscription_created: undefined;
  import_completed: { kind: 'json' | 'csv' | 'smart'; count: number };
  collection_created: undefined;
  notification_destination_created: { kind: 'email' | 'discord' | 'webhook' };
  subscriptions_exported: { format: 'json' | 'csv' };
};

type AnalyticsEvent = keyof AnalyticsEvents;

type UmamiPayload = {
  url?: string;
  referrer?: string;
  id?: string;
  name?: string;
  data?: Record<string, string | number>;
};

declare global {
  interface Window {
    // Missing during SSR, and when the script is blocked or fails to load.
    umami?: {
      track: (build: (defaults: UmamiPayload) => UmamiPayload) => Promise<unknown>;
    };
  }
}

type Page = {
  url: string;
  referrer: string | undefined;
  userId: string | undefined;
};

// The page the last pageview reported, which events are attributed to.
let currentPage: Page | undefined;

function send(payload: UmamiPayload) {
  void window.umami?.track((defaults) => ({
    ...defaults,
    url: currentPage?.url,
    referrer: currentPage?.referrer,
    id: currentPage?.userId,
    ...payload,
  }));
}

export function track<Event extends AnalyticsEvent>(
  event: Event,
  ...[data]: AnalyticsEvents[Event] extends undefined ? [] : [AnalyticsEvents[Event]]
) {
  send({ name: event, data });
}

// Campaign parameters are the only search state worth reporting.
function campaignSearch(search: string) {
  const campaign = new URLSearchParams();

  for (const [key, value] of new URLSearchParams(search)) {
    if (key.startsWith('utm_')) {
      campaign.append(key, value);
    }
  }

  const query = campaign.toString();
  return query ? `?${query}` : '';
}

// The tracker reports a same-origin referrer as a path, which can hold IDs.
function externalReferrer() {
  const { referrer } = document;

  if (!referrer || new URL(referrer).origin === window.location.origin) {
    return undefined;
  }

  return referrer;
}

/**
 * Reports a pageview whenever the resolved path changes. Search-only changes,
 * like table filters, stay on the same page.
 */
export function usePageviewTracking() {
  const router = useRouter();
  const pathname = useRouterState({ select: (state) => state.resolvedLocation?.pathname });

  useEffect(() => {
    if (!pathname) {
      return;
    }

    const { matches, resolvedLocation } = router.state;
    const leaf = matches.at(-1);

    if (!leaf || !resolvedLocation) {
      return;
    }

    // An unmatched path has no template, so it's reported as visited.
    const path = router.matchRoute({ to: leaf.fullPath }, { includeSearch: false }) ? leaf.fullPath : pathname;
    const userId = 'user' in leaf.context ? leaf.context.user.id : undefined;

    currentPage = {
      url: `${path}${campaignSearch(resolvedLocation.searchStr)}`,
      referrer: currentPage?.url ?? externalReferrer(),
      userId,
    };
    send({});
  }, [pathname, router]);
}
