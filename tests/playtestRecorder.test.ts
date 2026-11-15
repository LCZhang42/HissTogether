import { describe, expect, it } from 'vitest';
import type { RoomPhase, RoomSnapshot, ServerMessage } from '@qiqihar/shared';
import { defaultWebSocketUrl } from '../apps/client/src/network/socketClient';
import { PlaytestRecorder } from '../apps/client/src/playtest/recorder';

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
      type: 'attempt_result', attemptId: 1, success: false, overlapMs: 280, gag: 'near-miss', events: [],
    }, 500);
    recorder.recordMessage(roomState('feedback', 180_100), 500);
    recorder.recordDisconnect();
    recorder.recordMessage(roomState('playing', 180_100), 1_700);
    recorder.recordMessage({
      type: 'attempt_result', attemptId: 2, success: true, overlapMs: 420, events: [],
    }, 2_200);
    recorder.recordMessage({ type: 'room_result', result: 'win', attempts: 2, bestOverlapMs: 420 }, 2_200);

    const report = recorder.createReport('en', 2_200, { rttMs: 82, clockOffsetMs: -12 });
    expect(report).toMatchObject({
      version: 1,
      roomId: 'ABC123',
      localSlot: 0,
      durationMs: 2_100,
      result: 'win',
      attempts: 2,
      bestOverlapMs: 420,
      failureCounts: { 'near-miss': 1 },
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
    recorder.recordMessage({ type: 'room_result', result: 'timeout', attempts: 0, bestOverlapMs: 0 }, 5_000);
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
