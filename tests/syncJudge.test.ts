import { describe, expect, it } from 'vitest';
import { calculateOverlap, classifyFailure, findSynchronizedSlots, intervalFromAcceptedHiss, type HissInterval } from '@qiqihar/shared';

function interval(slot: 0 | 1 | 2 | 3, startMs: number, endMs: number): HissInterval {
  return { slot, startMs, endMs };
}

describe('calculateOverlap', () => {
  it('accepts exactly 300 ms of common overlap', () => {
    expect(calculateOverlap([
      interval(0, 0, 700), interval(1, 100, 800), interval(2, 200, 900), interval(3, 400, 1_100),
    ])).toEqual({ overlapMs: 300, success: true });
  });

  it('rejects 299 ms of common overlap', () => {
    expect(calculateOverlap([
      interval(0, 0, 700), interval(1, 100, 800), interval(2, 200, 900), interval(3, 401, 1_101),
    ])).toEqual({ overlapMs: 299, success: false });
  });

  it('rejects three cats', () => {
    expect(calculateOverlap([interval(0, 0, 700), interval(1, 0, 700), interval(2, 0, 700)])).toEqual({ overlapMs: 0, success: false });
  });

  it('returns maximum overlap for equal start times', () => {
    const intervals = ([0, 1, 2, 3] as const).map((slot) => intervalFromAcceptedHiss(slot, 1_000));
    expect(calculateOverlap(intervals)).toEqual({ overlapMs: 700, success: true });
  });
});

describe('classifyFailure', () => {
  it('uses the three-of-four gag when one cat is missing', () => {
    expect(classifyFailure([interval(0, 0, 700), interval(1, 80, 780), interval(2, 120, 820)])).toBe('three-of-four');
  });

  it('identifies a close 250 ms common overlap as a near miss', () => {
    expect(classifyFailure([
      interval(0, 0, 700), interval(1, 50, 750), interval(2, 150, 850), interval(3, 450, 1_150),
    ])).toBe('near-miss');
  });

  it('identifies a widely staggered sequence as a chorus', () => {
    expect(classifyFailure([
      interval(0, 0, 700), interval(1, 40, 740), interval(2, 300, 1_000), interval(3, 680, 1_380),
    ])).toBe('chorus');
  });
});

describe('findSynchronizedSlots', () => {
  it('identifies the three cats that aligned in a four-cat near miss', () => {
    expect(findSynchronizedSlots([
      interval(0, 0, 700), interval(1, 50, 750), interval(2, 150, 850), interval(3, 450, 1_150),
    ])).toEqual([0, 1, 2]);
  });

  it('marks all four cats after a valid synchronized hiss', () => {
    expect(findSynchronizedSlots([
      interval(0, 0, 700), interval(1, 100, 800), interval(2, 200, 900), interval(3, 400, 1_100),
    ])).toEqual([0, 1, 2, 3]);
  });

  it('does not mark a single isolated hiss as synchronized', () => {
    expect(findSynchronizedSlots([interval(0, 0, 700)])).toEqual([]);
  });
});

