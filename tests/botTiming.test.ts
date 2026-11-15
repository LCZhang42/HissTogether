import { buildBotSchedule } from '@qiqihar/shared';
import { describe, expect, it } from 'vitest';

const threeBots = [1, 2, 3] as const;

describe('buildBotSchedule', () => {
  it('keeps the fixed cycle available for deterministic automation', () => {
    expect(buildBotSchedule('TEST01', 1, threeBots, 'cycle')).toEqual([
      { slot: 1, delayMs: 40 },
      { slot: 2, delayMs: 100 },
      { slot: 3, delayMs: 180 },
    ]);
    expect(buildBotSchedule('TEST01', 3, threeBots, 'cycle')).toEqual([
      { slot: 1, delayMs: 40 },
      { slot: 2, delayMs: 130 },
      { slot: 3, delayMs: null },
    ]);
  });

  it('is reproducible for the same room and attempt', () => {
    expect(buildBotSchedule('CAT123', 7, threeBots)).toEqual(buildBotSchedule('CAT123', 7, threeBots));
  });

  it('varies the opening profile between rooms', () => {
    const signatures = new Set(
      ['CAT001', 'CAT002', 'CAT003', 'CAT004', 'CAT005', 'CAT006', 'CAT007', 'CAT008']
        .map((roomId) => buildBotSchedule(roomId, 1, threeBots).map((item) => item.delayMs).sort().join(',')),
    );
    expect(signatures.size).toBeGreaterThan(1);
  });

  it('does not always assign the missed hiss to the rightmost bot', () => {
    const missedSlots = new Set<number>();
    for (let room = 0; room < 16; room += 1) {
      for (let attempt = 1; attempt <= 8; attempt += 1) {
        const missed = buildBotSchedule(`ROOM${room}`, attempt, threeBots).find((item) => item.delayMs === null);
        if (missed) missedSlots.add(missed.slot);
      }
    }
    expect(missedSlots.size).toBeGreaterThan(1);
    expect(missedSlots).not.toEqual(new Set([3]));
  });
});
