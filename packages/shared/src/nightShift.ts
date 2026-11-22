import { NIGHT_SHIFT } from './constants.js';
import type { EncounterResult, NightRoundProgress, NightShiftSnapshot } from './types.js';

export function createNightShift(): NightShiftSnapshot {
  return {
    wave: 0,
    totalWaves: NIGHT_SHIFT.totalWaves,
    paws: NIGHT_SHIFT.startingPaws,
    maxPaws: NIGHT_SHIFT.startingPaws,
    combo: 0,
    bestCombo: 0,
    score: 0,
    correctWaves: 0,
  };
}

export function startNightWave(night: NightShiftSnapshot, wave: number): NightShiftSnapshot {
  return { ...night, wave: Math.max(1, Math.min(night.totalWaves, wave)) };
}

export function applyNightRound(night: NightShiftSnapshot, encounter: EncounterResult): NightRoundProgress {
  const combo = encounter.correct ? night.combo + 1 : 0;
  const perfectSync = encounter.outcome === 'synced_threat'
    && encounter.startSpreadMs <= NIGHT_SHIFT.perfectSyncSpreadMs;
  const scoreAwarded = encounter.correct
    ? NIGHT_SHIFT.baseScore * combo + (perfectSync ? NIGHT_SHIFT.perfectSyncBonus : 0)
    : 0;
  const nextNight: NightShiftSnapshot = {
    ...night,
    paws: encounter.correct ? night.paws : Math.max(0, night.paws - 1),
    combo,
    bestCombo: Math.max(night.bestCombo, combo),
    score: night.score + scoreAwarded,
    correctWaves: night.correctWaves + (encounter.correct ? 1 : 0),
  };
  const result = nextNight.paws === 0
    ? 'loss'
    : nextNight.wave >= nextNight.totalWaves
      ? 'win'
      : null;
  return { night: nextNight, scoreAwarded, perfectSync, result };
}
