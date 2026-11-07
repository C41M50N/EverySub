import { describe, expect, it } from 'vitest';

import {
  findServiceCategoryId,
  findTrackedSubscription,
  POPULAR_SERVICES,
  QUICK_ADD_LIMIT,
  searchPopularServices,
  type PopularService,
} from '@/features/onboarding/popular-services';

function service(name: string): PopularService {
  const found = POPULAR_SERVICES.find((candidate) => candidate.name === name);

  if (!found) {
    throw new Error(`No popular service named ${name}`);
  }

  return found;
}

function names(query: string): string[] {
  return searchPopularServices(query).services.map((candidate) => candidate.name);
}

describe('POPULAR_SERVICES', () => {
  it('has unique names', () => {
    const serviceNames = POPULAR_SERVICES.map((candidate) => candidate.name);

    expect(new Set(serviceNames).size).toBe(serviceNames.length);
  });
});

describe('searchPopularServices', () => {
  it('suggests the first services when nothing is typed', () => {
    expect(names('   ')).toHaveLength(QUICK_ADD_LIMIT);
  });

  it('ignores case and punctuation', () => {
    expect(names('ICLOUD')).toEqual(['iCloud+']);
    expect(names('disney plus')).toEqual(['Disney+']);
  });

  it('finds services by alias', () => {
    expect(names('hbo')).toEqual(['Max']);
    expect(names('photoshop')).toEqual(['Adobe Creative Cloud']);
  });

  it('ranks names that start with the query before later words and inner matches', () => {
    expect(names('pr')).toEqual(['Amazon Prime', 'YouTube Premium', 'Claude Pro']);
    expect(names('pass')).toEqual(['Xbox Game Pass', '1Password', 'DoorDash DashPass']);
  });

  it('caps the results', () => {
    expect(searchPopularServices('e').services).toHaveLength(QUICK_ADD_LIMIT);
    expect(searchPopularServices('e', 10).services).toHaveLength(10);
  });

  it('reports an exact match by name or alias', () => {
    expect(searchPopularServices('netflix').exactMatch).toBe(true);
    expect(searchPopularServices('nyt').exactMatch).toBe(true);
    expect(searchPopularServices('net').exactMatch).toBe(false);
    expect(searchPopularServices('Local gym')).toEqual({ services: [], exactMatch: false });
  });
});

describe('findTrackedSubscription', () => {
  it('matches the service name, ignoring case and punctuation', () => {
    const subscriptions = [{ name: 'Spotify' }, { name: 'icloud' }];

    expect(findTrackedSubscription(service('Spotify'), subscriptions)).toBe(subscriptions[0]);
    expect(findTrackedSubscription(service('iCloud+'), subscriptions)).toBe(subscriptions[1]);
  });

  it('matches the service name followed by a plan', () => {
    const subscriptions = [{ name: 'Netflix Premium' }];

    expect(findTrackedSubscription(service('Netflix'), subscriptions)).toBe(subscriptions[0]);
  });

  it('matches an alias exactly', () => {
    const subscriptions = [{ name: 'HBO Max' }];

    expect(findTrackedSubscription(service('Max'), subscriptions)).toBe(subscriptions[0]);
  });

  it('does not match a different service that shares a word or prefix', () => {
    const subscriptions = [{ name: 'YouTube TV' }, { name: 'Maxwell Gym' }, { name: 'Amazon Music' }];

    expect(findTrackedSubscription(service('YouTube Premium'), subscriptions)).toBeUndefined();
    expect(findTrackedSubscription(service('Max'), subscriptions)).toBeUndefined();
    expect(findTrackedSubscription(service('Amazon Prime'), subscriptions)).toBeUndefined();
  });
});

describe('findServiceCategoryId', () => {
  it('finds the category by name, ignoring case', () => {
    const categories = [
      { id: 'c1', name: 'entertainment' },
      { id: 'c2', name: 'Utilities' },
    ];

    expect(findServiceCategoryId(service('Netflix'), categories)).toBe('c1');
    expect(findServiceCategoryId(service('iCloud+'), categories)).toBe('c2');
  });
});
