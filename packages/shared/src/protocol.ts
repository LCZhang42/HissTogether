import type { AttemptEvent, CatSlot, FailureGag, PlayerAction, RoomSnapshot } from './types.js';

export type ClientMessage =
  | { type: 'join'; roomId?: string; nickname?: string; reconnectToken?: string }
  | { type: 'action'; seq: number; action: PlayerAction }
  | { type: 'move'; seq: number; direction: -1 | 0 | 1 }
  | { type: 'ping'; seq: number; clientTimeMs: number }
  | { type: 'replay' }
  | { type: 'quick_start' }
  | { type: 'matchmake' }
  | { type: 'cancel_matchmaking' };

export type ServerMessage =
  | { type: 'joined'; roomId: string; playerId: string; slot: CatSlot; reconnectToken: string }
  | { type: 'matchmaking_state'; status: 'searching' | 'cancelled'; queuedPlayers: number; deadlineMs: number | null }
  | { type: 'room_state'; state: RoomSnapshot }
  | { type: 'hiss_started'; slot: CatSlot; serverTimeMs: number; attemptId: number }
  | { type: 'player_moved'; slot: CatSlot; x: number; serverTimeMs: number }
  | { type: 'social_action'; slot: CatSlot; action: 'meow'; serverTimeMs: number }
  | { type: 'interaction'; fromSlot: CatSlot; toSlot: CatSlot; kind: 'boop'; serverTimeMs: number }
  | { type: 'chaos_event'; eventId: string; kind: 'achoo'; startMs: number; endMs: number; affectedSlots: CatSlot[] }
  | { type: 'room_result'; result: 'win' | 'timeout'; attempts: number; bestOverlapMs: number }
  | { type: 'attempt_result'; attemptId: number; success: boolean; overlapMs: number; gag?: FailureGag; events: AttemptEvent[] }
  | { type: 'pong'; seq: number; clientTimeMs: number; serverTimeMs: number }
  | { type: 'error'; code: string; message: string };

const actions = new Set(['hiss', 'meow', 'interact']);

export function parseClientMessage(raw: string): ClientMessage | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const message = value as Record<string, unknown>;
    if (message.type === 'join') {
      if (message.roomId !== undefined && typeof message.roomId !== 'string') return null;
      if (message.nickname !== undefined && typeof message.nickname !== 'string') return null;
      if (message.reconnectToken !== undefined && typeof message.reconnectToken !== 'string') return null;
      return {
        type: 'join',
        ...(message.roomId ? { roomId: message.roomId } : {}),
        ...(message.nickname ? { nickname: message.nickname } : {}),
        ...(message.reconnectToken ? { reconnectToken: message.reconnectToken } : {}),
      };
    }
    if (message.type === 'action' && Number.isSafeInteger(message.seq) && actions.has(String(message.action))) {
      return { type: 'action', seq: message.seq as number, action: message.action as PlayerAction };
    }
    if (message.type === 'move' && Number.isSafeInteger(message.seq) && [-1, 0, 1].includes(message.direction as number)) {
      return { type: 'move', seq: message.seq as number, direction: message.direction as -1 | 0 | 1 };
    }
    if (message.type === 'ping' && Number.isSafeInteger(message.seq) && typeof message.clientTimeMs === 'number' && Number.isFinite(message.clientTimeMs)) {
      return { type: 'ping', seq: message.seq as number, clientTimeMs: message.clientTimeMs };
    }
    if (message.type === 'replay') return { type: 'replay' };
    if (message.type === 'quick_start') return { type: 'quick_start' };
    if (message.type === 'matchmake') return { type: 'matchmake' };
    if (message.type === 'cancel_matchmaking') return { type: 'cancel_matchmaking' };
    return null;
  } catch {
    return null;
  }
}

