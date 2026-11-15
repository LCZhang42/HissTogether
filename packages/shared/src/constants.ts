/** All gameplay timing lives here so balance changes remain explicit and testable. */
export const HISS_TIMING = {
  anticipateMs: 200,
  activeMs: 700,
  recoverMs: 300,
  requiredOverlapMs: 300,
} as const;

export const ROOM_TIMING = {
  introMs: 10_000,
  attemptMs: 8_000,
  /** Resolve shortly after the first hiss so a missing fourth cat becomes a fast gag. */
  attemptResolveMs: 1_500,
  feedbackMs: 1_200,
  challengeMs: 180_000,
  reconnectGraceMs: 10_000,
  achooWarningMs: 1_500,
} as const;

export const NETWORK_LIMITS = {
  maxNicknameLength: 20,
  maxRoomIdLength: 12,
  actionsPerSecond: 12,
} as const;

export const CAT_COUNT = 4;

