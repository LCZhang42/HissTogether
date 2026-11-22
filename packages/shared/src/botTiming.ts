import { TRIGGER_TIMING } from './constants.js';
import type { CatSlot, TriggerKind } from './types.js';

export type BotProfileMode = 'seeded' | 'cycle';

export interface BotTimingAssignment {
  slot: CatSlot;
  delayMs: number | null;
}

/** Success, near miss, three-of-four, and staggered chorus timing shapes. */
const BOT_PROFILES: ReadonlyArray<ReadonlyArray<number | null>> = [
  [40, 100, 180],
  [50, 150, 450],
  [40, 130, null],
  [40, 300, 680],
];

function hashSeed(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

/**
 * Produces varied but reproducible bot behavior for a room and attempt.
 * `cycle` preserves the original fixed order for deterministic automation.
 */
export function buildBotSchedule(
  roomId: string,
  attemptId: number,
  botSlots: readonly CatSlot[],
  mode: BotProfileMode = 'seeded',
): BotTimingAssignment[] {
  const sortedSlots = [...botSlots].sort((a, b) => a - b);
  if (sortedSlots.length === 0) return [];

  if (mode === 'cycle') {
    const profile = BOT_PROFILES[(attemptId - 1) % BOT_PROFILES.length]!;
    return sortedSlots.map((slot, index) => ({ slot, delayMs: profile[index] ?? null }));
  }

  const profileIndex = hashSeed(`${roomId}:${attemptId}:profile`) % BOT_PROFILES.length;
  const profile = BOT_PROFILES[profileIndex]!;
  const delayOffset = hashSeed(`${roomId}:${attemptId}:offset`) % profile.length;
  const shuffledSlots = sortedSlots.sort((a, b) => {
    const scoreA = hashSeed(`${roomId}:${attemptId}:slot:${a}`);
    const scoreB = hashSeed(`${roomId}:${attemptId}:slot:${b}`);
    return (scoreA - scoreB) || (a - b);
  });

  return shuffledSlots.map((slot, index) => ({
    slot,
    delayMs: profile[(index + delayOffset) % profile.length] ?? null,
  }));
}

/** Fair trigger-mode bots react to the reveal, stay quiet for cat mom, and keep a tight shared rhythm. */
export function buildTriggerBotSchedule(
  roomId: string,
  encounterId: number,
  triggerKind: TriggerKind,
  botSlots: readonly CatSlot[],
): BotTimingAssignment[] {
  const sortedSlots = [...botSlots].sort((a, b) => {
    const scoreA = hashSeed(`${roomId}:${encounterId}:trigger-slot:${a}`);
    const scoreB = hashSeed(`${roomId}:${encounterId}:trigger-slot:${b}`);
    return (scoreA - scoreB) || (a - b);
  });
  if (triggerKind === 'cat-mom') return sortedSlots.map((slot) => ({ slot, delayMs: null }));
  return sortedSlots.map((slot, index) => ({
    slot,
    delayMs: TRIGGER_TIMING.botBaseDelayMs + index * TRIGGER_TIMING.botStepDelayMs,
  }));
}
