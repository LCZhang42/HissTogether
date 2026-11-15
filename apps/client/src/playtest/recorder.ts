import type { FailureGag, Locale, RoomPhase, ServerMessage } from '@qiqihar/shared';
import type { NetworkMetrics } from '../network/socketClient';

type AttemptResult = Extract<ServerMessage, { type: 'attempt_result' }>;
type RoomResult = Extract<ServerMessage, { type: 'room_result' }>;

export interface PlaytestReport {
  version: 1;
  roomId: string;
  localSlot?: number;
  locale: Locale;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  result: RoomResult['result'];
  attempts: number;
  bestOverlapMs: number;
  failureCounts: Partial<Record<FailureGag, number>>;
  disconnects: number;
  phaseDurationsMs: Partial<Record<RoomPhase, number>>;
  feedbackFraction: number;
  network?: NetworkMetrics;
}

export class PlaytestRecorder {
  private roomId = '';
  private localSlot: number | undefined;
  private startedAtMs: number | undefined;
  private endedAtMs: number | undefined;
  private result: RoomResult | undefined;
  private attempts: AttemptResult[] = [];
  private disconnects = 0;
  private currentPhase: RoomPhase | undefined;
  private phaseStartedAtMs: number | undefined;
  private phaseDurationsMs: Partial<Record<RoomPhase, number>> = {};

  recordMessage(message: ServerMessage, nowMs: number): void {
    if (message.type === 'joined') {
      if (this.roomId !== message.roomId) this.reset(message.roomId, message.slot);
      else this.localSlot = message.slot;
      return;
    }
    if (message.type === 'room_state') {
      const active = message.state.challengeEndsAtMs !== null
        && (message.state.phase === 'playing' || message.state.phase === 'intro');
      if (active && (this.startedAtMs === undefined || this.endedAtMs !== undefined)) this.startRun(nowMs, message.state.phase);
      else if (this.startedAtMs !== undefined && this.endedAtMs === undefined) this.transitionPhase(message.state.phase, nowMs);
      return;
    }
    if (message.type === 'attempt_result' && this.startedAtMs !== undefined && this.endedAtMs === undefined) {
      this.attempts.push(message);
      return;
    }
    if (message.type === 'room_result' && this.startedAtMs !== undefined && this.endedAtMs === undefined) {
      this.flushPhase(nowMs);
      this.endedAtMs = nowMs;
      this.result = message;
    }
  }

  recordDisconnect(): void {
    if (this.startedAtMs !== undefined && this.endedAtMs === undefined) this.disconnects += 1;
  }

  createReport(locale: Locale, nowMs: number, network?: NetworkMetrics): PlaytestReport | undefined {
    if (this.startedAtMs === undefined || !this.result) return undefined;
    const endedAtMs = this.endedAtMs ?? nowMs;
    const failureCounts: Partial<Record<FailureGag, number>> = {};
    this.attempts.forEach((attempt) => {
      if (!attempt.success && attempt.gag) failureCounts[attempt.gag] = (failureCounts[attempt.gag] ?? 0) + 1;
    });
    const activeMs = (this.phaseDurationsMs.playing ?? 0) + (this.phaseDurationsMs.intro ?? 0);
    const feedbackMs = this.phaseDurationsMs.feedback ?? 0;
    return {
      version: 1,
      roomId: this.roomId,
      ...(this.localSlot === undefined ? {} : { localSlot: this.localSlot }),
      locale,
      startedAt: new Date(this.startedAtMs).toISOString(),
      endedAt: new Date(endedAtMs).toISOString(),
      durationMs: endedAtMs - this.startedAtMs,
      result: this.result.result,
      attempts: this.result.attempts,
      bestOverlapMs: this.result.bestOverlapMs,
      failureCounts,
      disconnects: this.disconnects,
      phaseDurationsMs: { ...this.phaseDurationsMs },
      feedbackFraction: activeMs + feedbackMs === 0 ? 0 : feedbackMs / (activeMs + feedbackMs),
      ...(network ? { network } : {}),
    };
  }

  private reset(roomId: string, localSlot: number): void {
    this.roomId = roomId;
    this.localSlot = localSlot;
    this.startedAtMs = undefined;
    this.endedAtMs = undefined;
    this.result = undefined;
    this.attempts = [];
    this.disconnects = 0;
    this.currentPhase = undefined;
    this.phaseStartedAtMs = undefined;
    this.phaseDurationsMs = {};
  }

  private startRun(nowMs: number, phase: RoomPhase): void {
    this.startedAtMs = nowMs;
    this.endedAtMs = undefined;
    this.result = undefined;
    this.attempts = [];
    this.disconnects = 0;
    this.phaseDurationsMs = {};
    this.currentPhase = phase;
    this.phaseStartedAtMs = nowMs;
  }

  private transitionPhase(phase: RoomPhase, nowMs: number): void {
    if (phase === this.currentPhase) return;
    this.flushPhase(nowMs);
    this.currentPhase = phase;
    this.phaseStartedAtMs = nowMs;
  }

  private flushPhase(nowMs: number): void {
    if (this.currentPhase === undefined || this.phaseStartedAtMs === undefined) return;
    this.phaseDurationsMs[this.currentPhase] = (this.phaseDurationsMs[this.currentPhase] ?? 0) + nowMs - this.phaseStartedAtMs;
    this.phaseStartedAtMs = nowMs;
  }
}
