export type CatSlot = 0 | 1 | 2 | 3;
export type Locale = 'zh-CN' | 'en';
export type RoomPhase = 'waiting' | 'intro' | 'playing' | 'feedback' | 'success' | 'failure' | 'timeout';
export type PlayerAction = 'hiss' | 'meow' | 'interact';
export type TriggerKind = 'dog' | 'stranger' | 'cat-mom' | 'vacuum-mom';
export type TriggerCategory = 'threat' | 'safe';
export type TriggerDirection = 'left' | 'right';
export type TriggerSilhouette = 'low' | 'tall' | 'catlike';
export type TriggerClue = 'scratching' | 'footsteps' | 'bell' | 'warped-bell';
export type EncounterPhase = 'approaching' | 'clue' | 'responding' | 'feedback';
export type EncounterOutcome =
  | 'synced_threat'
  | 'correct_hold'
  | 'false_alarm'
  | 'missed_threat'
  | 'desynced_threat'
  | 'jumped_the_gun';

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
  encounter: EncounterSnapshot | null;
  night: NightShiftSnapshot;
}

export type FailureGag = 'three-of-four' | 'too-early' | 'too-late' | 'chorus' | 'near-miss' | 'silence';

export interface AttemptEvent {
  slot: CatSlot;
  acceptedAtMs: number;
  activeStartMs: number;
  activeEndMs: number;
}

export interface EncounterSnapshot {
  encounterId: number;
  phase: EncounterPhase;
  direction: TriggerDirection;
  silhouette: TriggerSilhouette;
  cueStartedAtMs: number;
  clueAtMs: number;
  revealAtMs: number;
  responseEndsAtMs: number;
  clue?: TriggerClue;
  /** Deliberately absent during `approaching`, so reconnect snapshots cannot spoil the answer. */
  triggerKind?: TriggerKind;
}

export interface EncounterResult {
  encounterId: number;
  triggerKind: TriggerKind;
  outcome: EncounterOutcome;
  correct: boolean;
  overlapMs: number;
  startSpreadMs: number;
  events: AttemptEvent[];
  earlySlots: CatSlot[];
  missingSlots: CatSlot[];
}

export type NightResult = 'win' | 'loss' | 'timeout';

export interface NightShiftSnapshot {
  wave: number;
  totalWaves: number;
  paws: number;
  maxPaws: number;
  combo: number;
  bestCombo: number;
  score: number;
  correctWaves: number;
}

export interface NightRoundProgress {
  night: NightShiftSnapshot;
  scoreAwarded: number;
  perfectSync: boolean;
  result: Exclude<NightResult, 'timeout'> | null;
}

