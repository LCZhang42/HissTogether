/** Estimate the current server wall clock from a locally sampled clock offset. */
export function estimatedServerNowMs(localNowMs: number, clockOffsetMs = 0): number {
  return localNowMs + clockOffsetMs;
}

/** Keep countdown rendering stable even after the authoritative deadline passes. */
export function remainingChallengeMs(
  challengeEndsAtMs: number | null,
  localNowMs: number,
  clockOffsetMs = 0,
): number {
  if (challengeEndsAtMs === null) return 0;
  return Math.max(0, challengeEndsAtMs - estimatedServerNowMs(localNowMs, clockOffsetMs));
}
