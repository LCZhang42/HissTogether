import { describe, expect, it } from 'vitest';
import { encounterSlotFeedback } from '../apps/client/src/game/slotFeedback';

const event = (slot: 0 | 1 | 2 | 3, startMs: number) => ({
  slot, acceptedAtMs: startMs, activeStartMs: startMs, activeEndMs: startMs + 700,
});
const progress = {
  night: { wave: 3, totalWaves: 6, paws: 2, maxPaws: 3, combo: 0, bestCombo: 1, score: 100, correctWaves: 1 },
  scoreAwarded: 0, perfectSync: false, result: null,
} as const;

describe('encounterSlotFeedback', () => {
  it('makes the late outlier red while preserving the synchronized trio', () => {
    const feedback = encounterSlotFeedback({
      type: 'encounter_result', encounterId: 3, triggerKind: 'dog', outcome: 'desynced_threat',
      correct: false, progress, overlapMs: 100, startSpreadMs: 600,
      events: [event(0, 0), event(1, 40), event(2, 80), event(3, 600)], earlySlots: [], missingSlots: [],
    }, new Set([0, 1, 2]));
    expect([...feedback]).toEqual([[3, { tone: 'danger', reason: 'slow' }]]);
  });

  it('marks a missing hiss as the direct failure', () => {
    const feedback = encounterSlotFeedback({
      type: 'encounter_result', encounterId: 3, triggerKind: 'dog', outcome: 'missed_threat',
      correct: false, progress, overlapMs: 0, startSpreadMs: 80,
      events: [event(0, 0), event(1, 40), event(2, 80)], earlySlots: [], missingSlots: [3],
    }, new Set([0, 1, 2]));
    expect(feedback.get(3)).toEqual({ tone: 'danger', reason: 'missing' });
  });
});
