import { randomBytes, randomUUID } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';
import {
  CAT_COUNT,
  NETWORK_LIMITS,
  ROOM_TIMING,
  calculateOverlap,
  classifyFailure,
  intervalFromAcceptedHiss,
  parseClientMessage,
  type AttemptEvent,
  type CatSlot,
  type PlayerSnapshot,
  type RoomPhase,
  type RoomSnapshot,
  type ServerMessage,
} from '@qiqihar/shared';

interface ClientSession {
  id: string;
  socket: WebSocket;
  roomId?: string;
  slot?: CatSlot;
  reconnectToken: string;
  nickname: string;
  lastSeq: number;
  lastMoveMs: number;
  lastMeowMs: number;
  lastInteractMs: number;
  matchmakingQueuedAtMs?: number;
  matchmakingDeadlineMs?: number;
}

interface SlotReservation {
  playerId: string;
  slot: CatSlot;
  nickname: string;
  timer: NodeJS.Timeout;
}

interface Room {
  id: string;
  publicMatch: boolean;
  players: Map<string, ClientSession>;
  bots: PlayerSnapshot[];
  reservations: Map<string, SlotReservation>;
  positions: [number, number, number, number];
  phase: RoomPhase;
  attemptId: number;
  attempts: number;
  bestOverlapMs: number;
  hisses: Map<CatSlot, AttemptEvent>;
  resolveTimer: NodeJS.Timeout | null;
  feedbackTimer: NodeJS.Timeout | null;
  chaosTimer: NodeJS.Timeout | null;
  challengeTimer: NodeJS.Timeout | null;
  challengeEndsAtMs: number | null;
  botTimers: NodeJS.Timeout[];
}

/** Deterministic profiles: success, near miss, three-of-four, terrible chorus. */
const BOT_PROFILES: ReadonlyArray<ReadonlyArray<number | null>> = [
  [40, 100, 180],
  [50, 150, 450],
  [40, 130, null],
  [40, 300, 680],
];

const port = Number(process.env.PORT ?? 8080);
const challengeMs = Number(process.env.CHALLENGE_MS ?? ROOM_TIMING.challengeMs);
const matchmakingWaitMs = Number(process.env.MATCHMAKING_WAIT_MS ?? 8_000);
const rooms = new Map<string, Room>();
const matchmakingQueue: ClientSession[] = [];
let matchmakingTimer: NodeJS.Timeout | null = null;
const server = new WebSocketServer({ port });

function createRoomId(): string {
  let roomId = '';
  do roomId = randomBytes(3).toString('hex').toUpperCase(); while (rooms.has(roomId));
  return roomId;
}

function createRoom(id: string, publicMatch = false): Room {
  return {
    id,
    publicMatch,
    players: new Map(),
    bots: [],
    reservations: new Map(),
    positions: [48, 122, 198, 272],
    phase: 'waiting',
    attemptId: 0,
    attempts: 0,
    bestOverlapMs: 0,
    hisses: new Map(),
    resolveTimer: null,
    feedbackTimer: null,
    chaosTimer: null,
    challengeTimer: null,
    challengeEndsAtMs: null,
    botTimers: [],
  };
}

function normalizeRoomId(value?: string): string | undefined {
  const roomId = value?.trim().toUpperCase();
  return roomId && /^[A-Z0-9]{4,12}$/.test(roomId) ? roomId : undefined;
}

function send(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function broadcast(room: Room, message: ServerMessage): void {
  for (const player of room.players.values()) send(player.socket, message);
}

function participants(room: Room): PlayerSnapshot[] {
  const humans: PlayerSnapshot[] = [...room.players.values()]
    .filter((player): player is ClientSession & { slot: CatSlot } => player.slot !== undefined)
    .map((player) => ({
      playerId: player.id,
      slot: player.slot,
      nickname: player.nickname,
      connected: player.socket.readyState === WebSocket.OPEN,
      isBot: false,
      x: room.positions[player.slot],
    }));
  return [...humans, ...room.bots].sort((a, b) => a.slot - b.slot);
}

function occupiedSlots(room: Room): Set<CatSlot> {
  return new Set([
    ...participants(room).map((player) => player.slot),
    ...[...room.reservations.values()].map((reservation) => reservation.slot),
  ]);
}

function snapshot(room: Room): RoomSnapshot {
  return {
    roomId: room.id,
    phase: room.phase,
    players: participants(room),
    reservedSlots: [...room.reservations.values()].map((reservation) => reservation.slot).sort(),
    attemptId: room.attemptId,
    attempts: room.attempts,
    bestOverlapMs: room.bestOverlapMs,
    challengeEndsAtMs: room.challengeEndsAtMs,
    serverTimeMs: Date.now(),
  };
}

function broadcastRoom(room: Room): void {
  broadcast(room, { type: 'room_state', state: snapshot(room) });
}

function placeSessionInRoom(session: ClientSession, room: Room, slot: CatSlot): void {
  session.roomId = room.id;
  session.slot = slot;
  room.players.set(session.id, session);
  send(session.socket, {
    type: 'joined',
    roomId: room.id,
    playerId: session.id,
    slot,
    reconnectToken: session.reconnectToken,
  });
}

function clearMatchmakingFields(session: ClientSession): void {
  delete session.matchmakingQueuedAtMs;
  delete session.matchmakingDeadlineMs;
}

function removeFromMatchmakingQueue(session: ClientSession): boolean {
  const index = matchmakingQueue.indexOf(session);
  if (index < 0) return false;
  matchmakingQueue.splice(index, 1);
  clearMatchmakingFields(session);
  return true;
}

function cleanMatchmakingQueue(): void {
  for (let index = matchmakingQueue.length - 1; index >= 0; index -= 1) {
    const session = matchmakingQueue[index]!;
    if (session.socket.readyState !== WebSocket.OPEN || session.roomId || session.matchmakingQueuedAtMs === undefined) {
      matchmakingQueue.splice(index, 1);
      clearMatchmakingFields(session);
    }
  }
}

function notifyMatchmakingQueue(): void {
  const queuedPlayers = Math.min(CAT_COUNT, matchmakingQueue.length);
  for (const session of matchmakingQueue) {
    send(session.socket, {
      type: 'matchmaking_state',
      status: 'searching',
      queuedPlayers,
      deadlineMs: session.matchmakingDeadlineMs ?? Date.now() + matchmakingWaitMs,
    });
  }
}

function takeQueuedSession(): ClientSession | undefined {
  cleanMatchmakingQueue();
  const session = matchmakingQueue.shift();
  if (session) clearMatchmakingFields(session);
  return session;
}

function fillPublicRoomFromQueue(room: Room): number {
  if (!room.publicMatch || room.reservations.size > 0 || !['waiting', 'feedback', 'success'].includes(room.phase)) return 0;
  let added = 0;
  while (matchmakingQueue.length > 0) {
    const occupied = occupiedSlots(room);
    let slot = ([0, 1, 2, 3] as const).find((candidate) => !occupied.has(candidate));
    if (slot === undefined) {
      const bot = room.bots.pop();
      slot = bot?.slot;
    }
    if (slot === undefined) break;
    const session = takeQueuedSession();
    if (!session) break;
    placeSessionInRoom(session, room, slot);
    added += 1;
  }
  if (added > 0) broadcastRoom(room);
  return added;
}

function createPublicMatch(group: ClientSession[]): void {
  if (group.length === 0) return;
  const room = createRoom(createRoomId(), true);
  rooms.set(room.id, room);
  group.forEach((session, index) => placeSessionInRoom(session, room, index as CatSlot));
  quickStart(room);
}

function scheduleMatchmakingTimer(): void {
  if (matchmakingTimer) clearTimeout(matchmakingTimer);
  matchmakingTimer = null;
  const first = matchmakingQueue[0];
  if (!first) return;
  const waitMs = Math.max(0, (first.matchmakingDeadlineMs ?? Date.now()) - Date.now());
  matchmakingTimer = setTimeout(() => processMatchmakingQueue(), waitMs);
}

function processMatchmakingQueue(): void {
  cleanMatchmakingQueue();

  const availableRooms = [...rooms.values()]
    .filter((room) => room.publicMatch && (room.bots.length > 0 || participants(room).length < CAT_COUNT) && room.reservations.size === 0 && ['waiting', 'feedback', 'success'].includes(room.phase))
    .sort((a, b) => (b.players.size - a.players.size) || (a.attemptId - b.attemptId));
  for (const room of availableRooms) {
    const addedPlayers = fillPublicRoomFromQueue(room);
    if (room.phase === 'success' && addedPlayers > 0) {
      room.phase = 'feedback';
      room.attempts = 0;
      room.bestOverlapMs = 0;
      broadcastRoom(room);
      room.feedbackTimer = setTimeout(() => startAttempt(room), ROOM_TIMING.feedbackMs);
    }
    if (room.phase === 'waiting' && participants(room).length === CAT_COUNT) startAttempt(room);
    if (matchmakingQueue.length === 0) break;
  }

  while (matchmakingQueue.length >= CAT_COUNT) {
    const group = Array.from({ length: CAT_COUNT }, () => takeQueuedSession()).filter(
      (session): session is ClientSession => session !== undefined,
    );
    createPublicMatch(group);
  }

  const first = matchmakingQueue[0];
  if (first && (first.matchmakingDeadlineMs ?? Infinity) <= Date.now()) {
    const group: ClientSession[] = [];
    while (group.length < CAT_COUNT) {
      const session = takeQueuedSession();
      if (!session) break;
      group.push(session);
    }
    createPublicMatch(group);
  }

  notifyMatchmakingQueue();
  scheduleMatchmakingTimer();
}

function pauseRoomForMissingParticipant(room: Room): void {
  if (participants(room).length >= CAT_COUNT) return;
  clearAttemptTimers(room);
  clearChallengeTimer(room);
  room.hisses.clear();
  room.phase = 'waiting';
}

function detachSessionFromRoom(session: ClientSession): void {
  if (!session.roomId) return;
  const room = rooms.get(session.roomId);
  delete session.roomId;
  delete session.slot;
  if (!room) return;
  room.players.delete(session.id);
  pauseRoomForMissingParticipant(room);
  if (room.players.size === 0 && room.reservations.size === 0) {
    clearAttemptTimers(room);
    clearChallengeTimer(room);
    rooms.delete(room.id);
  } else {
    broadcastRoom(room);
  }
}

function startMatchmaking(session: ClientSession): void {
  if (session.matchmakingQueuedAtMs !== undefined) {
    notifyMatchmakingQueue();
    return;
  }
  detachSessionFromRoom(session);
  const now = Date.now();
  session.matchmakingQueuedAtMs = now;
  session.matchmakingDeadlineMs = now + matchmakingWaitMs;
  matchmakingQueue.push(session);
  send(session.socket, {
    type: 'matchmaking_state',
    status: 'searching',
    queuedPlayers: Math.min(CAT_COUNT, matchmakingQueue.length),
    deadlineMs: session.matchmakingDeadlineMs,
  });
  processMatchmakingQueue();
}

function cancelMatchmaking(session: ClientSession): void {
  if (!removeFromMatchmakingQueue(session)) return;
  send(session.socket, { type: 'matchmaking_state', status: 'cancelled', queuedPlayers: 0, deadlineMs: null });
  processMatchmakingQueue();
  joinRoom(session);
}

function clearAttemptTimers(room: Room): void {
  if (room.resolveTimer) clearTimeout(room.resolveTimer);
  if (room.feedbackTimer) clearTimeout(room.feedbackTimer);
  if (room.chaosTimer) clearTimeout(room.chaosTimer);
  room.botTimers.forEach(clearTimeout);
  room.resolveTimer = null;
  room.feedbackTimer = null;
  room.chaosTimer = null;
  room.botTimers = [];
}

function clearChallengeTimer(room: Room): void {
  if (room.challengeTimer) clearTimeout(room.challengeTimer);
  room.challengeTimer = null;
  room.challengeEndsAtMs = null;
}

function finishRoomTimeout(room: Room): void {
  if (room.phase === 'success' || room.phase === 'timeout') return;
  clearAttemptTimers(room);
  clearChallengeTimer(room);
  room.phase = 'timeout';
  broadcast(room, { type: 'room_result', result: 'timeout', attempts: room.attempts, bestOverlapMs: room.bestOverlapMs });
  broadcastRoom(room);
}

function ensureChallengeTimer(room: Room): void {
  if (room.challengeTimer) return;
  room.challengeEndsAtMs = Date.now() + challengeMs;
  room.challengeTimer = setTimeout(() => finishRoomTimeout(room), challengeMs);
}

function beginPlayableAttempt(room: Room): void {
  if (participants(room).length !== CAT_COUNT) {
    room.phase = 'waiting';
    broadcastRoom(room);
    return;
  }
  room.phase = 'playing';
  broadcastRoom(room);
}

function startAttempt(room: Room): void {
  clearAttemptTimers(room);
  room.hisses.clear();
  if (participants(room).length !== CAT_COUNT) {
    room.phase = 'waiting';
    broadcastRoom(room);
    return;
  }
  ensureChallengeTimer(room);
  room.attemptId += 1;
  if (room.attemptId % 4 === 3) {
    room.phase = 'intro';
    broadcastRoom(room);
    const availableSlots = participants(room).map((player) => player.slot);
    const roomSeed = [...room.id].reduce((total, character) => total + character.charCodeAt(0), 0);
    const affectedSlot = availableSlots[(roomSeed + room.attemptId) % availableSlots.length]!;
    const startMs = Date.now();
    const endMs = startMs + ROOM_TIMING.achooWarningMs;
    broadcast(room, {
      type: 'chaos_event',
      eventId: `${room.id}-${room.attemptId}-achoo`,
      kind: 'achoo',
      startMs,
      endMs,
      affectedSlots: [affectedSlot],
    });
    room.chaosTimer = setTimeout(() => beginPlayableAttempt(room), ROOM_TIMING.achooWarningMs);
    return;
  }
  beginPlayableAttempt(room);
}

function resolveAttempt(room: Room): void {
  if (room.phase !== 'playing') return;
  clearAttemptTimers(room);
  const events = [...room.hisses.values()].sort((a, b) => a.slot - b.slot);
  const intervals = events.map((event) => ({ slot: event.slot, startMs: event.activeStartMs, endMs: event.activeEndMs }));
  const result = calculateOverlap(intervals);
  room.attempts += 1;
  room.bestOverlapMs = Math.max(room.bestOverlapMs, result.overlapMs);
  room.phase = result.success ? 'success' : 'feedback';
  broadcast(room, {
    type: 'attempt_result',
    attemptId: room.attemptId,
    success: result.success,
    overlapMs: result.overlapMs,
    ...(result.success ? {} : { gag: classifyFailure(intervals) }),
    events,
  });
  if (result.success) {
    clearChallengeTimer(room);
    broadcast(room, { type: 'room_result', result: 'win', attempts: room.attempts, bestOverlapMs: room.bestOverlapMs });
  }
  broadcastRoom(room);

  if (result.success) {
    const addedPlayers = fillPublicRoomFromQueue(room);
    if (addedPlayers > 0) {
      room.phase = 'feedback';
      room.attempts = 0;
      room.bestOverlapMs = 0;
      broadcastRoom(room);
      room.feedbackTimer = setTimeout(() => startAttempt(room), ROOM_TIMING.feedbackMs);
    }
    processMatchmakingQueue();
  } else {
    processMatchmakingQueue();
    room.feedbackTimer = setTimeout(() => startAttempt(room), ROOM_TIMING.feedbackMs);
  }
}

function scheduleBots(room: Room): void {
  const profile = BOT_PROFILES[(room.attemptId - 1) % BOT_PROFILES.length]!;
  const bots = [...room.bots].sort((a, b) => a.slot - b.slot);
  bots.forEach((bot, index) => {
    const delay = profile[index] ?? null;
    if (delay === null) return;
    room.botTimers.push(setTimeout(() => recordHiss(room, bot.slot, false), delay));
  });
}

function recordHiss(room: Room, slot: CatSlot, canTriggerBots = true): void {
  if (room.phase !== 'playing' || room.hisses.has(slot)) return;
  const acceptedAtMs = Date.now();
  const interval = intervalFromAcceptedHiss(slot, acceptedAtMs);
  room.hisses.set(slot, {
    slot,
    acceptedAtMs,
    activeStartMs: interval.startMs,
    activeEndMs: interval.endMs,
  });
  broadcast(room, { type: 'hiss_started', slot, serverTimeMs: acceptedAtMs, attemptId: room.attemptId });

  if (room.hisses.size === 1) {
    room.resolveTimer = setTimeout(() => resolveAttempt(room), ROOM_TIMING.attemptResolveMs);
    if (canTriggerBots) scheduleBots(room);
  }
  if (room.hisses.size === CAT_COUNT) resolveAttempt(room);
}

function joinRoom(session: ClientSession, requestedRoomId?: string, reconnectToken?: string): void {
  if (session.roomId || session.matchmakingQueuedAtMs !== undefined) return;
  const roomId = normalizeRoomId(requestedRoomId) ?? createRoomId();
  let room = rooms.get(roomId);
  if (!room) {
    room = createRoom(roomId);
    rooms.set(roomId, room);
  }
  const activeSession = reconnectToken
    ? [...room.players.values()].find((player) => player.reconnectToken === reconnectToken)
    : undefined;
  if (activeSession?.slot !== undefined) {
    const slot = activeSession.slot;
    room.players.delete(activeSession.id);
    delete activeSession.roomId;
    delete activeSession.slot;
    activeSession.socket.close(4000, 'Session resumed in another connection');
    session.id = activeSession.id;
    session.nickname = activeSession.nickname;
    session.reconnectToken = reconnectToken!;
    placeSessionInRoom(session, room, slot);
    broadcastRoom(room);
    return;
  }
  const reservation = reconnectToken ? room.reservations.get(reconnectToken) : undefined;
  if (reservation) {
    clearTimeout(reservation.timer);
    room.reservations.delete(reconnectToken!);
    session.id = reservation.playerId;
    session.nickname = reservation.nickname;
    session.reconnectToken = reconnectToken!;
    placeSessionInRoom(session, room, reservation.slot);
    if (participants(room).length === CAT_COUNT) startAttempt(room);
    else broadcastRoom(room);
    return;
  }

  const occupied = occupiedSlots(room);
  let slot = ([0, 1, 2, 3] as const).find((candidate) => !occupied.has(candidate));
  if (slot === undefined && room.bots.length > 0) {
    const replacedBot = room.bots.pop();
    slot = replacedBot?.slot;
  }
  if (slot === undefined) {
    send(session.socket, { type: 'error', code: 'ROOM_FULL', message: 'Room is full.' });
    return;
  }
  placeSessionInRoom(session, room, slot);
  if (participants(room).length === CAT_COUNT && room.phase === 'waiting') startAttempt(room);
  else broadcastRoom(room);
}

function quickStart(room: Room): void {
  const occupied = occupiedSlots(room);
  for (const slot of [0, 1, 2, 3] as const) {
    if (!occupied.has(slot)) {
      room.bots.push({
        playerId: `bot-${room.id}-${slot}`,
        slot,
        nickname: `BOT ${slot + 1}`,
        connected: true,
        isBot: true,
        x: room.positions[slot],
      });
    }
  }
  if (room.phase === 'waiting') startAttempt(room);
  else broadcastRoom(room);
}

server.on('connection', (socket) => {
  const session: ClientSession = {
    id: randomUUID(),
    socket,
    reconnectToken: randomUUID(),
    nickname: `P${Math.floor(Math.random() * 90) + 10}`,
    lastSeq: -1,
    lastMoveMs: 0,
    lastMeowMs: 0,
    lastInteractMs: 0,
  };

  socket.on('message', (data) => {
    const message = parseClientMessage(data.toString());
    if (!message) {
      send(socket, { type: 'error', code: 'BAD_MESSAGE', message: 'Invalid message.' });
      return;
    }
    if (message.type === 'join') {
      if (message.nickname) session.nickname = message.nickname.slice(0, NETWORK_LIMITS.maxNicknameLength);
      joinRoom(session, message.roomId, message.reconnectToken);
      return;
    }
    if (message.type === 'ping') {
      send(socket, { type: 'pong', seq: message.seq, clientTimeMs: message.clientTimeMs, serverTimeMs: Date.now() });
      return;
    }
    if (message.type === 'matchmake') {
      startMatchmaking(session);
      return;
    }
    if (message.type === 'cancel_matchmaking') {
      cancelMatchmaking(session);
      return;
    }
    if (!session.roomId) return;
    const room = rooms.get(session.roomId);
    if (!room) return;

    if (message.type === 'quick_start') {
      quickStart(room);
      return;
    }
    if (message.type === 'replay' && ['feedback', 'success', 'timeout'].includes(room.phase)) {
      if (room.phase === 'success' || room.phase === 'timeout') {
        clearChallengeTimer(room);
        room.attempts = 0;
        room.bestOverlapMs = 0;
      }
      startAttempt(room);
      return;
    }
    if (message.type === 'action' || message.type === 'move') {
      if (message.seq <= session.lastSeq) return;
      session.lastSeq = message.seq;
      if (session.slot === undefined) return;
      const now = Date.now();
      if (message.type === 'move') {
        if (now - session.lastMoveMs < 40) return;
        session.lastMoveMs = now;
        const x = Math.max(24, Math.min(296, room.positions[session.slot] + message.direction * 7));
        room.positions[session.slot] = x;
        broadcast(room, { type: 'player_moved', slot: session.slot, x, serverTimeMs: now });
        return;
      }
      if (message.action === 'hiss') {
        recordHiss(room, session.slot);
      } else if (message.action === 'meow' && now - session.lastMeowMs >= 800) {
        session.lastMeowMs = now;
        broadcast(room, { type: 'social_action', slot: session.slot, action: 'meow', serverTimeMs: now });
      } else if (message.action === 'interact' && now - session.lastInteractMs >= 700) {
        session.lastInteractMs = now;
        const target = participants(room)
          .filter((player) => player.slot !== session.slot)
          .map((player) => ({ slot: player.slot, distance: Math.abs(room.positions[player.slot] - room.positions[session.slot!]) }))
          .sort((a, b) => a.distance - b.distance)[0];
        if (target && target.distance <= 72) {
          broadcast(room, { type: 'interaction', fromSlot: session.slot, toSlot: target.slot, kind: 'boop', serverTimeMs: now });
        }
      }
    }
  });

  socket.on('close', () => {
    if (removeFromMatchmakingQueue(session)) processMatchmakingQueue();
    if (!session.roomId) return;
    const room = rooms.get(session.roomId);
    if (!room) return;
    room.players.delete(session.id);
    if (session.slot !== undefined) {
      const existing = room.reservations.get(session.reconnectToken);
      if (existing) clearTimeout(existing.timer);
      const reservation: SlotReservation = {
        playerId: session.id,
        slot: session.slot,
        nickname: session.nickname,
        timer: setTimeout(() => {
          const current = room.reservations.get(session.reconnectToken);
          if (current !== reservation) return;
          room.reservations.delete(session.reconnectToken);
          if (room.players.size === 0 && room.reservations.size === 0) {
            clearAttemptTimers(room);
            clearChallengeTimer(room);
            rooms.delete(room.id);
          } else {
            if (room.publicMatch) {
              processMatchmakingQueue();
              if (participants(room).length < CAT_COUNT) quickStart(room);
            } else {
              broadcastRoom(room);
            }
          }
        }, ROOM_TIMING.reconnectGraceMs),
      };
      room.reservations.set(session.reconnectToken, reservation);
    }
    pauseRoomForMissingParticipant(room);
    broadcastRoom(room);
  });
});

console.log(`[qiqihar] WebSocket server listening on ws://localhost:${port}`);
