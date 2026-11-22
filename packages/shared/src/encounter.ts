import { CAT_COUNT, TRIGGER_TIMING } from './constants.js';
import type {
  AttemptEvent,
  CatSlot,
  EncounterResult,
  TriggerCategory,
  TriggerClue,
  TriggerKind,
  TriggerSilhouette,
} from './types.js';

export function triggerCategory(kind: TriggerKind): TriggerCategory {
  return kind === 'cat-mom' ? 'safe' : 'threat';
}

export function triggerSilhouette(kind: TriggerKind): TriggerSilhouette {
  if (kind === 'stranger') return 'tall';
  if (kind === 'cat-mom' || kind === 'vacuum-mom') return 'catlike';
  return 'low';
}

export function triggerClue(kind: TriggerKind): TriggerClue {
  if (kind === 'stranger') return 'footsteps';
  if (kind === 'cat-mom') return 'bell';
  if (kind === 'vacuum-mom') return 'warped-bell';
  return 'scratching';
}

export function triggerKindForEncounter(encounterId: number): TriggerKind {
  const nightSequence = ['dog', 'cat-mom', 'stranger', 'vacuum-mom', 'cat-mom', 'vacuum-mom'] as const;
  return nightSequence[(Math.max(1, encounterId) - 1) % nightSequence.length]!;
}

export function compensatedAcceptedAtMs(
  receivedAtMs: number,
  estimatedServerTimeMs: number | undefined,
  earliestAllowedMs: number,
  maxCompensationMs = TRIGGER_TIMING.maxInputCompensationMs,
): number {
  if (estimatedServerTimeMs === undefined || !Number.isFinite(estimatedServerTimeMs)) return receivedAtMs;
  const observedTransitMs = Math.max(0, receivedAtMs - estimatedServerTimeMs);
  const compensationMs = Math.min(maxCompensationMs, observedTransitMs);
  return Math.max(earliestAllowedMs, receivedAtMs - compensationMs);
}

export function evaluateEncounter(
  encounterId: number,
  triggerKind: TriggerKind,
  events: readonly AttemptEvent[],
  earlySlots: readonly CatSlot[] = [],
): EncounterResult {
  const uniqueEvents = [...new Map(events.map((event) => [event.slot, event])).values()]
    .sort((a, b) => a.slot - b.slot);
  const uniqueEarlySlots = [...new Set(earlySlots)].sort((a, b) => a - b);
  const actedSlots = new Set(uniqueEvents.map((event) => event.slot));
  const missingSlots = ([0, 1, 2, 3] as const).filter((slot) => !actedSlots.has(slot));
  const starts = uniqueEvents.map((event) => event.activeStartMs);
  const overlapMs = uniqueEvents.length === CAT_COUNT
    ? Math.max(0, Math.min(...uniqueEvents.map((event) => event.activeEndMs)) - Math.max(...starts))
    : 0;
  const startSpreadMs = starts.length > 1 ? Math.max(...starts) - Math.min(...starts) : 0;

  if (uniqueEarlySlots.length > 0) {
    return {
      encounterId, triggerKind, outcome: 'jumped_the_gun', correct: false,
      overlapMs, startSpreadMs, events: uniqueEvents, earlySlots: uniqueEarlySlots, missingSlots,
    };
  }

  if (triggerCategory(triggerKind) === 'safe') {
    const correct = uniqueEvents.length === 0;
    return {
      encounterId, triggerKind, outcome: correct ? 'correct_hold' : 'false_alarm', correct,
      overlapMs, startSpreadMs, events: uniqueEvents, earlySlots: [],
      missingSlots: correct ? [] : missingSlots,
    };
  }

  if (uniqueEvents.length < CAT_COUNT) {
    return {
      encounterId, triggerKind, outcome: 'missed_threat', correct: false,
      overlapMs, startSpreadMs, events: uniqueEvents, earlySlots: [], missingSlots,
    };
  }

  const correct = overlapMs >= TRIGGER_TIMING.requiredOverlapMs;
  return {
    encounterId, triggerKind, outcome: correct ? 'synced_threat' : 'desynced_threat', correct,
    overlapMs, startSpreadMs, events: uniqueEvents, earlySlots: [], missingSlots: [],
  };
}
