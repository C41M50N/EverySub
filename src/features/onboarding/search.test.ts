import { describe, expect, it } from 'vitest';

import { validateNotificationSettingsSearch } from '@/features/onboarding/search';

describe('validateNotificationSettingsSearch', () => {
  it('keeps a collection ID', () => {
    expect(validateNotificationSettingsSearch({ remindersFor: 'abc123' })).toEqual({ remindersFor: 'abc123' });
  });

  it('drops missing, empty, and non-string values', () => {
    expect(validateNotificationSettingsSearch({})).toEqual({ remindersFor: undefined });
    expect(validateNotificationSettingsSearch({ remindersFor: '' })).toEqual({ remindersFor: undefined });
    expect(validateNotificationSettingsSearch({ remindersFor: 42 })).toEqual({ remindersFor: undefined });
  });
});
