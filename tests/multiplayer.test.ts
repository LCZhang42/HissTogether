import { spawn, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import WebSocket from 'ws';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ClientMessage, ServerMessage } from '@qiqihar/shared';

class TestClient {
  readonly received: ServerMessage[] = [];
  private readonly waiters = new Set<{
    predicate: (message: ServerMessage) => boolean;
    resolve: (message: ServerMessage) => void;
  }>();

  constructor(readonly socket: WebSocket) {
    socket.on('message', (data) => {
      const message = JSON.parse(data.toString()) as ServerMessage;
      this.received.push(message);
      for (const waiter of this.waiters) {
        if (waiter.predicate(message)) {
          this.waiters.delete(waiter);
          waiter.resolve(message);
        }
      }
    });
  }

  send(message: ClientMessage): void {
    this.socket.send(JSON.stringify(message));
  }

  waitFor<T extends ServerMessage>(predicate: (message: ServerMessage) => message is T, timeoutMs?: number): Promise<T>;
  waitFor(predicate: (message: ServerMessage) => boolean, timeoutMs?: number): Promise<ServerMessage>;
  waitFor(predicate: (message: ServerMessage) => boolean, timeoutMs = 4_000): Promise<ServerMessage> {
    const existing = this.received.find(predicate);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolvePromise, reject) => {
      const waiter = { predicate, resolve: resolvePromise };
      this.waiters.add(waiter);
      const timer = setTimeout(() => {
        this.waiters.delete(waiter);
        reject(new Error('Timed out waiting for server message'));
      }, timeoutMs);
      waiter.resolve = (message) => {
        clearTimeout(timer);
        resolvePromise(message);
      };
    });
  }

  close(): void {
    this.socket.close();
  }
}

const isJoined = (message: ServerMessage): message is Extract<ServerMessage, { type: 'joined' }> => message.type === 'joined';
const isResult = (message: ServerMessage): message is Extract<ServerMessage, { type: 'encounter_result' }> => message.type === 'encounter_result';
const isPong = (message: ServerMessage): message is Extract<ServerMessage, { type: 'pong' }> => message.type === 'pong';
const isMatchmaking = (message: ServerMessage): message is Extract<ServerMessage, { type: 'matchmaking_state' }> => message.type === 'matchmaking_state';

describe('authoritative multiplayer room', () => {
  let serverProcess: ChildProcess;
  let port: number;
  const clients: TestClient[] = [];

  beforeAll(async () => {
    port = 19_000 + Math.floor(Math.random() * 2_000);
    serverProcess = spawn(process.execPath, [resolve('apps/server/dist/index.js')], {
      env: { ...process.env, PORT: String(port), CHALLENGE_MS: '8000', MATCHMAKING_WAIT_MS: '1000', BOT_PROFILE_MODE: 'cycle' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    await new Promise<void>((resolvePromise, reject) => {
      const timer = setTimeout(() => reject(new Error('Server did not start')), 5_000);
      serverProcess.stdout?.on('data', (chunk) => {
        if (String(chunk).includes('WebSocket server listening')) {
          clearTimeout(timer);
          resolvePromise();
        }
      });
      serverProcess.once('error', reject);
      serverProcess.once('exit', (code) => code && reject(new Error(`Server exited with ${code}`)));
    });
  }, 8_000);

  afterAll(() => {
    clients.forEach((client) => client.close());
    serverProcess?.kill();
  });

  async function connect(): Promise<TestClient> {
    const socket = new WebSocket(`ws://127.0.0.1:${port}`);
    const client = new TestClient(socket);
    clients.push(client);
    await new Promise<void>((resolvePromise, reject) => {
      socket.once('open', () => resolvePromise());
      socket.once('error', reject);
    });
    return client;
  }

  async function connectFour(): Promise<{ group: TestClient[]; roomId: string }> {
    const first = await connect();
    first.send({ type: 'join' });
    const firstJoined = await first.waitFor(isJoined);
    const group = [first];
    for (let index = 1; index < 4; index += 1) {
      const client = await connect();
      group.push(client);
      client.send({ type: 'join', roomId: firstJoined.roomId });
      await client.waitFor(isJoined);
    }
    await Promise.all(group.map((client) => client.waitFor(
      (message) => message.type === 'room_state' && message.state.phase === 'playing',
    )));
    return { group, roomId: firstJoined.roomId };
  }

  function hissWithOutboundDelay(client: TestClient, seq: number, delayMs: number, compensationMs = 0): Promise<void> {
    return new Promise((resolvePromise) => {
      setTimeout(() => {
        client.send({
          type: 'action',
          seq,
          action: 'hiss',
          ...(compensationMs > 0 ? { estimatedServerTimeMs: Date.now() - compensationMs } : {}),
        });
        resolvePromise();
      }, delayMs);
    });
  }

  it('matches four queued players immediately without bots', async () => {
    const group = await Promise.all(Array.from({ length: 4 }, () => connect()));
    group.forEach((client) => client.send({ type: 'matchmake' }));
    const joined = await Promise.all(group.map((client) => client.waitFor(isJoined)));

    expect(new Set(joined.map((message) => message.roomId)).size).toBe(1);
    const states = await Promise.all(group.map((client) => client.waitFor(
      (message): message is Extract<ServerMessage, { type: 'room_state' }> =>
        message.type === 'room_state' && message.state.phase === 'playing',
    )));
    expect(states.every((message) => message.state.players.length === 4)).toBe(true);
    expect(states.every((message) => message.state.players.every((player) => !player.isBot))).toBe(true);
    group.forEach((client) => client.close());
  });

  it('starts timed-out queued players together and fills remaining slots with bots', async () => {
    const first = await connect();
    const second = await connect();
    first.send({ type: 'matchmake' });
    second.send({ type: 'matchmake' });

    const searching = await first.waitFor(
      (message): message is Extract<ServerMessage, { type: 'matchmaking_state' }> =>
        isMatchmaking(message) && message.status === 'searching' && message.queuedPlayers === 2,
    );
    expect(searching.deadlineMs).not.toBeNull();
    const [firstJoined, secondJoined] = await Promise.all([
      first.waitFor(isJoined, 3_000),
      second.waitFor(isJoined, 3_000),
    ]);
    expect(firstJoined.roomId).toBe(secondJoined.roomId);
    const state = await first.waitFor(
      (message): message is Extract<ServerMessage, { type: 'room_state' }> =>
        message.type === 'room_state' && message.state.phase === 'playing',
    );
    expect(state.state.players.filter((player) => player.isBot)).toHaveLength(2);
    expect(state.state.players.filter((player) => !player.isBot)).toHaveLength(2);
    first.close();
    second.close();
  });

  it('lets a queued player replace a bot only after the active attempt resolves', async () => {
    const first = await connect();
    first.send({ type: 'matchmake' });
    const firstJoined = await first.waitFor(isJoined, 2_000);
    await first.waitFor((message) => message.type === 'room_state' && message.state.phase === 'playing');

    const newcomer = await connect();
    newcomer.send({ type: 'matchmake' });
    await newcomer.waitFor((message) => isMatchmaking(message) && message.status === 'searching');
    expect(newcomer.received.some(isJoined)).toBe(false);

    first.send({ type: 'action', seq: 1, action: 'hiss' });
    const newcomerJoined = await newcomer.waitFor(isJoined, 4_000);
    expect(newcomerJoined.roomId).toBe(firstJoined.roomId);
    const nextAttempt = await newcomer.waitFor(
      (message): message is Extract<ServerMessage, { type: 'room_state' }> =>
        message.type === 'room_state' && message.state.phase === 'playing' &&
        message.state.players.filter((player) => !player.isBot).length === 2,
      4_000,
    );
    expect(nextAttempt.state.players.filter((player) => player.isBot)).toHaveLength(2);
  }, 7_000);

  it('cancels matchmaking and returns the player to a private room', async () => {
    const client = await connect();
    client.send({ type: 'matchmake' });
    await client.waitFor((message) => isMatchmaking(message) && message.status === 'searching');
    client.send({ type: 'cancel_matchmaking' });
    const cancelled = await client.waitFor(
      (message): message is Extract<ServerMessage, { type: 'matchmaking_state' }> =>
        isMatchmaking(message) && message.status === 'cancelled',
    );
    expect(cancelled.deadlineMs).toBeNull();
    expect((await client.waitFor(isJoined)).roomId).toBeTruthy();
  });

  it('gives four clients one matching result and restores a reserved slot', async () => {
    const first = await connect();
    const pingStartedAt = Date.now();
    first.send({ type: 'ping', seq: 99, clientTimeMs: pingStartedAt });
    const pong = await first.waitFor(isPong);
    expect(pong.seq).toBe(99);
    expect(pong.clientTimeMs).toBe(pingStartedAt);
    expect(pong.serverTimeMs).toBeGreaterThanOrEqual(pingStartedAt - 1_000);
    expect(pong.serverTimeMs).toBeLessThanOrEqual(Date.now() + 1_000);
    first.send({ type: 'join' });
    const firstJoined = await first.waitFor(isJoined);

    const group = [first];
    const joined = [firstJoined];
    for (let index = 1; index < 4; index += 1) {
      const client = await connect();
      group.push(client);
      client.send({ type: 'join', roomId: firstJoined.roomId });
      joined.push(await client.waitFor(isJoined));
    }

    await Promise.all(group.map((client) => client.waitFor(
      (message) => message.type === 'room_state' && message.state.phase === 'playing',
    )));

    first.send({ type: 'move', seq: 1, direction: 1 });
    const moved = await first.waitFor((message) => message.type === 'player_moved');
    expect(moved.type === 'player_moved' && moved.x).toBe(55);
    first.send({ type: 'action', seq: 2, action: 'meow' });
    await first.waitFor((message) => message.type === 'social_action' && message.slot === firstJoined.slot);
    first.send({ type: 'action', seq: 3, action: 'interact' });
    await first.waitFor((message) => message.type === 'interaction' && message.fromSlot === firstJoined.slot);

    const resultPromises = group.map((client) => client.waitFor(isResult));
    first.send({ type: 'action', seq: 4, action: 'hiss' });
    group.slice(1).forEach((client) => client.send({ type: 'action', seq: 1, action: 'hiss' }));
    first.send({ type: 'action', seq: 4, action: 'hiss' });
    const results = await Promise.all(resultPromises);

    expect(results.every((result) => result.correct && result.progress.night.wave === 1)).toBe(true);
    expect(new Set(results.map((result) => result.encounterId)).size).toBe(1);
    expect(results.every((result) => result.events.length === 4)).toBe(true);

    const disconnected = group[3]!;
    const disconnectedIdentity = joined[3]!;
    first.received.length = 0;
    disconnected.close();
    await first.waitFor((message) =>
      message.type === 'room_state' && message.state.reservedSlots.includes(disconnectedIdentity.slot),
    );

    const reconnected = await connect();
    reconnected.send({
      type: 'join',
      roomId: firstJoined.roomId,
      reconnectToken: disconnectedIdentity.reconnectToken,
    });
    const restored = await reconnected.waitFor(isJoined);
    expect(restored.slot).toBe(disconnectedIdentity.slot);
    expect(restored.playerId).toBe(disconnectedIdentity.playerId);
    await first.waitFor((message) =>
      message.type === 'room_state' && message.state.phase === 'playing' && message.state.reservedSlots.length === 0,
    );

    const previousConnectionClosed = new Promise<void>((resolvePromise) => {
      reconnected.socket.once('close', () => resolvePromise());
    });
    const takeover = await connect();
    takeover.send({
      type: 'join',
      roomId: firstJoined.roomId,
      reconnectToken: disconnectedIdentity.reconnectToken,
    });
    const takenOver = await takeover.waitFor(isJoined);
    expect(takenOver.slot).toBe(disconnectedIdentity.slot);
    expect(takenOver.playerId).toBe(disconnectedIdentity.playerId);
    await previousConnectionClosed;

    await first.waitFor((message) =>
      message.type === 'room_state' && message.state.phase === 'playing' && message.state.attemptId === 2,
    );
    await first.waitFor((message) =>
      message.type === 'encounter_result' && message.encounterId === 2 && message.outcome === 'correct_hold',
      4_000,
    );
    await first.waitFor((message) =>
      message.type === 'room_state' && message.state.phase === 'playing' && message.state.attemptId === 3,
      4_000,
    );
    first.received.length = 0;
    first.send({ type: 'action', seq: 5, action: 'hiss' });
    group[1]!.send({ type: 'action', seq: 2, action: 'hiss' });
    group[2]!.send({ type: 'action', seq: 2, action: 'hiss' });
    await first.waitFor((message) => message.type === 'hiss_started');
    takeover.close();
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1_700));
    expect(first.received.some((message) => message.type === 'encounter_result')).toBe(false);
  }, 18_000);

  it('conceals identity through silhouette and clue stages, rejects an early hiss, and punishes hissing at cat mom', async () => {
    const client = await connect();
    client.send({ type: 'join' });
    const joined = await client.waitFor(isJoined);
    client.send({ type: 'quick_start' });
    const cue = await client.waitFor((message) => message.type === 'trigger_cue' && message.encounterId === 1);
    expect('kind' in cue).toBe(false);
    expect(cue.type === 'trigger_cue' && cue.silhouette).toBe('low');
    const concealed = await client.waitFor((message) =>
      message.type === 'room_state' && message.state.attemptId === 1 && message.state.phase === 'intro',
    );
    expect(concealed.type === 'room_state' && concealed.state.encounter?.triggerKind).toBeUndefined();
    const clue = await client.waitFor(
      (message): message is Extract<ServerMessage, { type: 'trigger_clue' }> =>
        message.type === 'trigger_clue' && message.encounterId === 1,
    );
    expect(clue.clue).toBe('scratching');
    const clueState = await client.waitFor(
      (message): message is Extract<ServerMessage, { type: 'room_state' }> =>
        message.type === 'room_state' && message.state.encounter?.phase === 'clue',
    );
    expect(clueState.state.encounter?.triggerKind).toBeUndefined();
    expect(clueState.state.encounter?.clue).toBe('scratching');
    client.send({ type: 'action', seq: 1, action: 'hiss' });
    await client.waitFor((message) =>
      message.type === 'encounter_result' && message.encounterId === 1 && message.outcome === 'jumped_the_gun',
    );
    await client.waitFor((message) =>
      message.type === 'room_state' && message.state.attemptId === 2 && message.state.phase === 'playing',
      4_000,
    );
    client.send({ type: 'action', seq: 2, action: 'hiss' });
    await client.waitFor((message) =>
      message.type === 'encounter_result' && message.encounterId === 2 && message.outcome === 'false_alarm',
    );
    expect(joined.roomId).toBeTruthy();
  }, 12_000);

  it('keeps four jittered clients on one authoritative result and recovers next attempt', async () => {
    const { group, roomId } = await connectFour();
    const failedResults = group.map((client) => client.waitFor(
      (message): message is Extract<ServerMessage, { type: 'encounter_result' }> =>
        message.type === 'encounter_result' && message.encounterId === 1,
    ));

    // Simulated outbound latency leaves only 250 ms of common active hiss: an authoritative failure.
    await Promise.all(group.map((client, index) =>
      hissWithOutboundDelay(client, 10, [0, 100, 200, 450][index]!),
    ));
    const failures = await Promise.all(failedResults);
    expect(failures.every((result) => !result.correct && result.outcome === 'desynced_threat' && result.overlapMs < 500)).toBe(true);
    expect(failures.every((result) => result.progress.night.paws === 2 && result.progress.night.combo === 0)).toBe(true);
    expect(new Set(failures.map((result) => JSON.stringify(result))).size).toBe(1);

    await Promise.all(group.map((client) => client.waitFor(
      (message) => message.type === 'room_state' && message.state.phase === 'playing' && message.state.attemptId === 2,
      4_000,
    )));
    const falseAlarmResults = group.map((client) => client.waitFor(
      (message) => message.type === 'encounter_result' && message.encounterId === 2 && message.outcome === 'false_alarm',
    ));
    group[0]!.send({ type: 'action', seq: 11, action: 'hiss' });
    await Promise.all(falseAlarmResults);
    group[0]!.send({ type: 'replay' });
    await Promise.all(group.map((client) => client.waitFor(
      (message) => message.type === 'room_state' && message.state.phase === 'playing' && message.state.attemptId === 3,
      5_000,
    )));
    const recoveredResults = group.map((client) => client.waitFor(
      (message): message is Extract<ServerMessage, { type: 'encounter_result' }> =>
        message.type === 'encounter_result' && message.encounterId === 3,
    ));

    // A raw 250 ms spread would fail; the late client's capped 80 ms estimate reduces it to about 170 ms.
    await Promise.all(group.map((client, index) =>
      hissWithOutboundDelay(client, 12, [0, 50, 100, 250][index]!, index === 3 ? 80 : 0),
    ));
    const recovered = await Promise.all(recoveredResults);
    expect(recovered.every((result) => result.correct && result.overlapMs >= 500)).toBe(true);
    expect(recovered.every((result) => result.progress.night.paws === 1 && result.progress.night.score > 0)).toBe(true);
    expect(new Set(recovered.map((result) => JSON.stringify(result))).size).toBe(1);
    expect(roomId).toBeTruthy();
  }, 16_000);

  it('continues a successful wave with combo and score instead of ending the room', async () => {
    const { group } = await connectFour();
    const results = group.map((client) => client.waitFor(isResult));
    group.forEach((client, index) => client.send({ type: 'action', seq: 30 + index, action: 'hiss' }));
    const resolved = await Promise.all(results);
    expect(resolved.every((result) => result.correct && result.progress.result === null)).toBe(true);
    expect(resolved.every((result) => result.progress.night.combo === 1 && result.progress.night.score >= 100)).toBe(true);

    const nextWave = await Promise.all(group.map((client) => client.waitFor(
      (message): message is Extract<ServerMessage, { type: 'room_state' }> =>
        message.type === 'room_state' && message.state.phase === 'playing' && message.state.attemptId === 2,
    )));
    expect(nextWave.every((message) => message.state.night.wave === 2 && message.state.night.paws === 3)).toBe(true);
  });

  it('ends the night after three mistakes and resets all progression on replay', async () => {
    const client = await connect();
    client.send({ type: 'join' });
    await client.waitFor(isJoined);
    client.send({ type: 'quick_start' });

    for (let wave = 1; wave <= 3; wave += 1) {
      await client.waitFor((message) =>
        message.type === 'room_state' && message.state.phase === 'intro' && message.state.attemptId === wave,
      );
      client.send({ type: 'action', seq: 50 + wave, action: 'hiss' });
      await client.waitFor((message) =>
        message.type === 'encounter_result' && message.encounterId === wave && !message.correct,
      );
    }

    const ended = await client.waitFor(
      (message): message is Extract<ServerMessage, { type: 'room_result' }> =>
        message.type === 'room_result' && message.result === 'loss',
    );
    expect(ended.night).toMatchObject({ wave: 3, paws: 0, combo: 0, score: 0 });
    await client.waitFor((message) => message.type === 'room_state' && message.state.phase === 'failure');

    client.received.length = 0;
    client.send({ type: 'replay' });
    const replayed = await client.waitFor(
      (message): message is Extract<ServerMessage, { type: 'room_state' }> =>
        message.type === 'room_state' && message.state.phase === 'intro' && message.state.attemptId === 1,
    );
    expect(replayed.state.night).toMatchObject({ wave: 1, paws: 3, combo: 0, score: 0, correctWaves: 0 });
  }, 10_000);

  it('ends an idle room authoritatively and can replay without reconnecting', async () => {
    const client = await connect();
    client.send({ type: 'join' });
    await client.waitFor(isJoined);
    client.send({ type: 'quick_start' });
    const playing = await client.waitFor((message) =>
      message.type === 'room_state' && message.state.phase === 'playing' && message.state.challengeEndsAtMs !== null,
    );
    expect(playing.type === 'room_state' && playing.state.challengeEndsAtMs).not.toBeNull();
    const result = await client.waitFor(
      (message) => message.type === 'room_result' && message.result === 'timeout',
      9_000,
    );
    expect(result.type === 'room_result' && result.attempts).toBeGreaterThanOrEqual(1);
    expect(result.type === 'room_result' && result.bestOverlapMs).toBe(0);
    expect(result.type === 'room_result' && result.night.paws).toBeGreaterThan(0);
    await client.waitFor((message) => message.type === 'room_state' && message.state.phase === 'timeout');

    client.received.length = 0;
    client.send({ type: 'replay' });
    const replayed = await client.waitFor((message) =>
      message.type === 'room_state' && message.state.phase === 'playing' && message.state.attempts === 0,
    );
    expect(replayed.type === 'room_state' && replayed.state.attempts).toBe(0);
  }, 12_000);
});
