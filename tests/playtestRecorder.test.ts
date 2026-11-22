import { describe, expect, it } from 'vitest';
import type { RoomPhase, RoomSnapshot, ServerMessage } from '@qiqihar/shared';
import { defaultWebSocketUrl } from '../apps/client/src/network/socketClient';
import { PlaytestRecorder } from '../apps/client/src/playtest/recorder';

const night = { wave: 2, totalWaves: 6, paws: 2, maxPaws: 3, combo: 1, bestCombo: 1, score: 300, correctWaves: 1 };
const progress = { night, scoreAwarded: 100, perfectSync: false, result: null } as const;

function roomState(phase: RoomPhase, challengeEndsAtMs: number | null): Extract<ServerMessage, { type: 'room_state' }> {
  const state: RoomSnapshot = {
    roomId: 'ABC123',
    phase,
    attemptId: 1,
    attempts: 0,
    bestOverlapMs: 0,
    challengeEndsAtMs,
    players: [],
    reservedSlots: [],
    serverTimeMs: 0,
    encounter: null,
    night,
  };
  return { type: 'room_state', state };
}

describe('phase-five playtest recorder', () => {
  it('summarizes attempts, failure gags, disconnects and phase timing', () => {
    const recorder = new PlaytestRecorder();
    recorder.recordMessage({
      type: 'joined', roomId: 'ABC123', playerId: 'p1', slot: 0, reconnectToken: 'token',
    }, 0);
    recorder.recordMessage(roomState('playing', 180_100), 100);
    recorder.recordMessage({
      type: 'encounter_result', encounterId: 1, triggerKind: 'dog', outcome: 'desynced_threat', correct: false, progress,
      overlapMs: 280, startSpreadMs: 420, events: [], earlySlots: [], missingSlots: [],
    }, 500);
    recorder.recordMessage(roomState('feedback', 180_100), 500);
    recorder.recordDisconnect();
    recorder.recordMessage(roomState('playing', 180_100), 1_700);
    recorder.recordMessage({
      type: 'encounter_result', encounterId: 2, triggerKind: 'dog', outcome: 'synced_threat', correct: true, progress,
      overlapMs: 520, startSpreadMs: 180, events: [], earlySlots: [], missingSlots: [],
    }, 2_200);
    recorder.recordMessage({ type: 'room_result', result: 'win', attempts: 2, bestOverlapMs: 420, night }, 2_200);

    const report = recorder.createReport('en', 2_200, { rttMs: 82, clockOffsetMs: -12 });
    expect(report).toMatchObject({
      version: 3,
      roomId: 'ABC123',
      localSlot: 0,
      durationMs: 2_100,
      result: 'win',
      attempts: 2,
      bestOverlapMs: 420,
      finalScore: 300,
      correctWaves: 1,
      bestCombo: 1,
      pawsRemaining: 2,
      failureCounts: {},
      outcomeCounts: { desynced_threat: 1, synced_threat: 1 },
      disconnects: 1,
      phaseDurationsMs: { playing: 900, feedback: 1_200 },
      network: { rttMs: 82, clockOffsetMs: -12 },
    });
    expect(report?.feedbackFraction).toBeCloseTo(1_200 / 2_100, 5);
  });

  it('starts a fresh report when a completed room is replayed', () => {
    const recorder = new PlaytestRecorder();
    recorder.recordMessage({
      type: 'joined', roomId: 'ABC123', playerId: 'p1', slot: 0, reconnectToken: 'token',
    }, 0);
    recorder.recordMessage(roomState('playing', 5_000), 100);
    recorder.recordMessage({ type: 'room_result', result: 'timeout', attempts: 0, bestOverlapMs: 0, night }, 5_000);
    expect(recorder.createReport('zh-CN', 5_000)?.result).toBe('timeout');
    recorder.recordMessage(roomState('playing', 10_000), 6_000);
    expect(recorder.createReport('zh-CN', 6_100)).toBeUndefined();
  });
});

describe('LAN WebSocket URL', () => {
  it('targets the page host and matches secure transport', () => {
    expect(defaultWebSocketUrl({ protocol: 'http:', hostname: '192.168.1.23' })).toBe('ws://192.168.1.23:8080');
    expect(defaultWebSocketUrl({ protocol: 'https:', hostname: 'game.example' })).toBe('wss://game.example:8080');
  });
});
