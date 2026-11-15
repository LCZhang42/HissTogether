export type CatSlot = 0 | 1 | 2 | 3;
export type Locale = 'zh-CN' | 'en';
export type RoomPhase = 'waiting' | 'intro' | 'playing' | 'feedback' | 'success' | 'timeout';
export type PlayerAction = 'hiss' | 'meow' | 'interact';

export interface HissInterval {
  slot: CatSlot;
  startMs: number;
  endMs: number;
}

export interface PlayerSnapshot {
  playerId: string;
  slot: CatSlot;
  nickname: string;
  connected: boolean;
  isBot: boolean;
  x: number;
}

export interface RoomSnapshot {
  roomId: string;
  phase: RoomPhase;
  players: PlayerSnapshot[];
  reservedSlots: CatSlot[];
  attemptId: number;
  attempts: number;
  bestOverlapMs: number;
  challengeEndsAtMs: number | null;
  serverTimeMs: number;
}

export type FailureGag = 'three-of-four' | 'too-early' | 'too-late' | 'chorus' | 'near-miss' | 'silence';

export interface AttemptEvent {
  slot: CatSlot;
  acceptedAtMs: number;
  activeStartMs: number;
  activeEndMs: number;
}

