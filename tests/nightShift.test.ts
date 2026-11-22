import { applyNightRound, createNightShift, startNightWave, type EncounterResult } from '@qiqihar/shared';
import { describe, expect, it } from 'vitest';

function result(overrides: Partial<EncounterResult> = {}): EncounterResult {
  return {
    encounterId: 1,
    triggerKind: 'dog',
    outcome: 'synced_threat',
    correct: true,
    overlapMs: 600,
    startSpreadMs: 100,
    events: [],
    earlySlots: [],
    missingSlots: [],
    ...overrides,
  };
}

describe('night shift progression', () => {
  it('starts with six waves and three paws', () => {
    expect(createNightShift()).toEqual({
      wave: 0, totalWaves: 6, paws: 3, maxPaws: 3,
      combo: 0, bestCombo: 0, score: 0, correctWaves: 0,
    });
  });

  it('builds combo score and awards a perfect-sync bonus', () => {
    const first = applyNightRound(startNightWave(createNightShift(), 1), result());
    expect(first).toMatchObject({ scoreAwarded: 200, perfectSync: true, result: null });
    expect(first.night).toMatchObject({ combo: 1, bestCombo: 1, score: 200, paws: 3, correctWaves: 1 });

    const second = applyNightRound(startNightWave(first.night, 2), result({
      encounterId: 2, triggerKind: 'cat-mom', outcome: 'correct_hold', startSpreadMs: 0,
    }));
    expect(second).toMatchObject({ scoreAwarded: 200, perfectSync: false, result: null });
    expect(second.night).toMatchObject({ combo: 2, bestCombo: 2, score: 400, correctWaves: 2 });
  });

  it('spends one paw and resets combo after a mistake', () => {
    const night = { ...createNightShift(), wave: 3, combo: 2, bestCombo: 2, score: 400, correctWaves: 2 };
    const progress = applyNightRound(night, result({ correct: false, outcome: 'desynced_threat' }));
    expect(progress).toMatchObject({ scoreAwarded: 0, result: null });
    expect(progress.night).toMatchObject({ paws: 2, combo: 0, bestCombo: 2, score: 400, correctWaves: 2 });
  });

  it('wins after wave six with a paw left and loses when the last paw is spent', () => {
    const finalWin = applyNightRound({ ...createNightShift(), wave: 6 }, result({ encounterId: 6 }));
    expect(finalWin.result).toBe('win');

    const finalLoss = applyNightRound({ ...createNightShift(), wave: 3, paws: 1 }, result({
      encounterId: 3, correct: false, outcome: 'missed_threat',
    }));
    expect(finalLoss.result).toBe('loss');
    expect(finalLoss.night.paws).toBe(0);
  });
});
