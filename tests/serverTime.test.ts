import { describe, expect, it } from 'vitest';
import { estimatedServerNowMs, remainingChallengeMs } from '../apps/client/src/network/serverTime';

describe('server-clock countdown', () => {
  it('applies positive and negative server clock offsets', () => {
    expect(estimatedServerNowMs(10_000, 350)).toBe(10_350);
    expect(estimatedServerNowMs(10_000, -225)).toBe(9_775);
  });

  it('renders the same remaining time from clients with different wall clocks', () => {
    const deadline = 50_000;
    expect(remainingChallengeMs(deadline, 40_000, 1_000)).toBe(9_000);
    expect(remainingChallengeMs(deadline, 42_000, -1_000)).toBe(9_000);
  });

  it('clamps expired and inactive challenges to zero', () => {
    expect(remainingChallengeMs(5_000, 6_000, 0)).toBe(0);
    expect(remainingChallengeMs(null, 6_000, 0)).toBe(0);
  });
});
