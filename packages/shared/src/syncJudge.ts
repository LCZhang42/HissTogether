import { CAT_COUNT, HISS_TIMING } from './constants.js';
import type { CatSlot, FailureGag, HissInterval } from './types.js';

export interface OverlapResult {
  overlapMs: number;
  success: boolean;
}

export interface TimingOutlier {
  slot: CatSlot;
  timing: 'fast' | 'slow';
}

export function calculateOverlap(intervals: readonly HissInterval[]): OverlapResult {
  const uniqueSlots = new Set(intervals.map((interval) => interval.slot));
  if (intervals.length !== CAT_COUNT || uniqueSlots.size !== CAT_COUNT) {
    return { overlapMs: 0, success: false };
  }

  const latestStart = Math.max(...intervals.map((interval) => interval.startMs));
  const earliestEnd = Math.min(...intervals.map((interval) => interval.endMs));
  const overlapMs = Math.max(0, earliestEnd - latestStart);
  return { overlapMs, success: overlapMs >= HISS_TIMING.requiredOverlapMs };
}

export function intervalFromAcceptedHiss(slot: HissInterval['slot'], acceptedAtMs: number): HissInterval {
  const startMs = acceptedAtMs + HISS_TIMING.anticipateMs;
  return { slot, startMs, endMs: startMs + HISS_TIMING.activeMs };
}

/** Returns the largest group sharing a valid hiss overlap, for clear post-attempt feedback. */
export function findSynchronizedSlots(
  intervals: readonly HissInterval[],
  requiredOverlapMs: number = HISS_TIMING.requiredOverlapMs,
): CatSlot[] {
  const uniqueIntervals = [...new Map(intervals.map((interval) => [interval.slot, interval])).values()];
  let bestSlots: CatSlot[] = [];
  let bestOverlapMs = 0;

  for (let mask = 1; mask < (1 << uniqueIntervals.length); mask += 1) {
    const group = uniqueIntervals.filter((_, index) => (mask & (1 << index)) !== 0);
    if (group.length < 2) continue;
    const latestStart = Math.max(...group.map((interval) => interval.startMs));
    const earliestEnd = Math.min(...group.map((interval) => interval.endMs));
    const overlapMs = Math.max(0, earliestEnd - latestStart);
    if (overlapMs < requiredOverlapMs) continue;
    if (group.length > bestSlots.length || (group.length === bestSlots.length && overlapMs > bestOverlapMs)) {
      bestSlots = group.map((interval) => interval.slot).sort((a, b) => a - b);
      bestOverlapMs = overlapMs;
    }
  }

  return bestSlots;
}

/** Finds the extreme hiss start(s) furthest from the group's median rhythm. */
export function findTimingOutliers(intervals: readonly HissInterval[]): TimingOutlier[] {
  const uniqueIntervals = [...new Map(intervals.map((interval) => [interval.slot, interval])).values()];
  if (uniqueIntervals.length < 2) return [];

  const sortedStarts = uniqueIntervals.map((interval) => interval.startMs).sort((a, b) => a - b);
  const middle = Math.floor(sortedStarts.length / 2);
  const median = sortedStarts.length % 2 === 0
    ? (sortedStarts[middle - 1]! + sortedStarts[middle]!) / 2
    : sortedStarts[middle]!;
  const maxDistance = Math.max(...uniqueIntervals.map((interval) => Math.abs(interval.startMs - median)));
  if (maxDistance === 0) return [];

  return uniqueIntervals
    .filter((interval) => Math.abs(interval.startMs - median) === maxDistance)
    .map((interval): TimingOutlier => ({ slot: interval.slot, timing: interval.startMs < median ? 'fast' : 'slow' }))
    .sort((a, b) => a.slot - b.slot);
}

export function classifyFailure(intervals: readonly HissInterval[]): FailureGag {
  if (intervals.length === 0) return 'silence';
  if (intervals.length === CAT_COUNT - 1) return 'three-of-four';
  if (intervals.length < CAT_COUNT) return 'chorus';

  const { overlapMs } = calculateOverlap(intervals);
  const starts = intervals.map((interval) => interval.startMs);
  const spreadMs = Math.max(...starts) - Math.min(...starts);
  if (overlapMs >= HISS_TIMING.requiredOverlapMs - 150) return 'near-miss';
  if (spreadMs >= HISS_TIMING.activeMs * 0.7) return 'chorus';
  return 'too-late';
}

