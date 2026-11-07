import { describe, expect, it } from 'vitest';

import {
  buildSignatureHeaders,
  computeSignature,
  generateSigningSecret,
  getUnexpiredSecrets,
  retireSecret,
  verifySignature,
} from '@/features/notifications/signing';

// The Standard Webhooks specification's published example.
const SPEC_EXAMPLE = {
  id: 'msg_p5jXN8AQM9LWM0D4loKWxJek',
  timestamp: 1614265330,
  body: '{"test": 2432232314}',
  secret: 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw',
  signature: 'g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=',
};

describe('Standard Webhooks signatures', () => {
  const { id, timestamp, body, secret, signature } = SPEC_EXAMPLE;

  it('matches the specification’s published example', () => {
    expect(computeSignature({ id, timestamp, body, secret })).toBe(signature);
  });

  it('sends the ID, the timestamp in seconds, and a v1 signature', () => {
    expect(buildSignatureHeaders({ id, timestamp, body, secrets: [secret] })).toEqual({
      'webhook-id': 'msg_p5jXN8AQM9LWM0D4loKWxJek',
      'webhook-timestamp': '1614265330',
      'webhook-signature': 'v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=',
    });
  });

  it('accepts a timestamp up to five minutes from the receiver’s clock', () => {
    const verifyAt = (offsetSeconds: number) =>
      verifySignature({
        id,
        timestamp: String(timestamp),
        signatureHeader: `v1,${signature}`,
        body,
        secret,
        now: new Date((timestamp + offsetSeconds) * 1000),
      });

    expect(verifyAt(300)).toEqual({ ok: true });
    expect(verifyAt(-300)).toEqual({ ok: true });
    expect(verifyAt(301)).toEqual({ ok: false, reason: 'expired' });
    expect(verifyAt(-301)).toEqual({ ok: false, reason: 'expired' });
  });

  it('signs with both secrets during rotation so either verifies', () => {
    const now = new Date(timestamp * 1000);
    const current = generateSigningSecret();
    const previous = generateSigningSecret();
    const headers = buildSignatureHeaders({ id, timestamp, body, secrets: [current, previous] });

    for (const candidate of [current, previous]) {
      expect(
        verifySignature({
          id,
          timestamp: String(timestamp),
          signatureHeader: headers['webhook-signature'],
          body,
          secret: candidate,
          now,
        }),
      ).toEqual({ ok: true });
    }
  });

  it('rejects a changed body, the wrong secret, or a missing signature', () => {
    const base = {
      id,
      timestamp: String(timestamp),
      signatureHeader: `v1,${signature}`,
      body,
      secret,
      now: new Date(timestamp * 1000),
    };

    expect(verifySignature(base)).toEqual({ ok: true });
    expect(verifySignature({ ...base, body: `${body} ` })).toEqual({ ok: false, reason: 'mismatch' });
    expect(verifySignature({ ...base, secret: generateSigningSecret() })).toEqual({ ok: false, reason: 'mismatch' });
    expect(verifySignature({ ...base, signatureHeader: null })).toEqual({ ok: false, reason: 'missing' });
  });
});

describe('retired signing secrets', () => {
  const now = new Date('2026-10-04T13:00:00Z');
  const secrets = (entries: { secret: string }[]) => entries.map((entry) => entry.secret);

  it('keeps signing with a rotated-out secret for 24 hours', () => {
    const retired = retireSecret([], 'whsec_first', now);

    expect(retired).toEqual([{ secret: 'whsec_first', expiresAt: '2026-10-05T13:00:00.000Z' }]);
    expect(secrets(getUnexpiredSecrets(retired, new Date('2026-10-05T12:59:59.999Z')))).toEqual(['whsec_first']);
    expect(getUnexpiredSecrets(retired, new Date('2026-10-05T13:00:00Z'))).toEqual([]);
  });

  it('gives each rotated-out secret its own 24 hours through repeated rotations', () => {
    const once = retireSecret([], 'whsec_first', now);
    const twice = retireSecret(once, 'whsec_second', new Date('2026-10-04T14:00:00Z'));

    expect(secrets(twice)).toEqual(['whsec_first', 'whsec_second']);
    expect(secrets(getUnexpiredSecrets(twice, new Date('2026-10-05T13:30:00Z')))).toEqual(['whsec_second']);
  });

  it('drops expired secrets at the next rotation', () => {
    const retired = retireSecret([], 'whsec_first', now);

    expect(secrets(retireSecret(retired, 'whsec_second', new Date('2026-10-05T13:00:00Z')))).toEqual(['whsec_second']);
  });
});
