import { describe, expect, it, vi } from 'vitest';

import { describeErrorSafely, UserFacingError, withUserFacingErrors } from '@/lib/errors';

describe('withUserFacingErrors', () => {
  it('passes through user-facing messages', async () => {
    await expect(
      withUserFacingErrors('Fallback', async () => {
        throw new UserFacingError('Next invoice date must be today or later');
      }),
    ).rejects.toThrow('Next invoice date must be today or later');
  });

  it('replaces unexpected errors with the fallback message', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      withUserFacingErrors('Fallback', async () => {
        throw new Error('column "next_invoice_date" is of type date but expression is of type text');
      }),
    ).rejects.toThrow(/^Fallback$/);
    expect(consoleError).toHaveBeenCalledOnce();

    consoleError.mockRestore();
  });
});

describe('describeErrorSafely', () => {
  it('keeps the type and code but drops the message', () => {
    const error = Object.assign(new Error('Failing row contains (https://hooks.example.com/secret)'), {
      code: '23514',
    });

    expect(describeErrorSafely(error)).toBe('Error (23514)');
  });

  it('logs only the safe description when details are off', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      withUserFacingErrors(
        'Fallback',
        async () => {
          throw new Error('whsec_secret');
        },
        { logDetails: false },
      ),
    ).rejects.toThrow(/^Fallback$/);
    expect(consoleError).toHaveBeenCalledWith('Error');

    consoleError.mockRestore();
  });
});
