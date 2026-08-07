import { describe, expect, it } from 'vitest';
import { extractVerificationCode } from '../src/shared/verification-code';

describe('extractVerificationCode', () => {
  it('does not treat the keyword itself as the code', () => {
    const result = extractVerificationCode({
      subject: 'Your Verification Code',
      text: 'Use code: 849201 to continue.',
      receivedAt: '2026-08-07T01:00:00.000Z',
      from: 'service@example.com'
    });
    expect(result?.code).toBe('849201');
    expect(result?.confidence).toBe('high');
  });

  it('finds a labelled code with words between the label and value', () => {
    const result = extractVerificationCode({
      subject: 'Sign in',
      text: 'Your verification code is 4920. It expires soon.',
      receivedAt: '2026-08-07T01:00:00.000Z'
    });
    expect(result?.code).toBe('4920');
    expect(result?.score).toBeGreaterThanOrEqual(50);
  });

  it('rejects an order number and URL token without verification context', () => {
    expect(
      extractVerificationCode({
        subject: 'Order confirmation',
        text: 'Order number 123456. Track at https://example.test/123456.',
        receivedAt: '2026-08-07T01:00:00.000Z'
      })
    ).toBeUndefined();
  });
});
