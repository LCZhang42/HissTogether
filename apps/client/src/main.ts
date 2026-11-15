import Phaser from 'phaser';
import { findSynchronizedSlots, type CatSlot, type FailureGag, type Locale, type RoomSnapshot, type ServerMessage } from '@qiqihar/shared';
import { AudioManager } from './audio/audioManager';
import { BootScene } from './game/BootScene';
import { SocketClient, type NetworkMetrics } from './network/socketClient';
import { remainingChallengeMs } from './network/serverTime';
import { PlaytestRecorder } from './playtest/recorder';
import { dictionary, getInitialLocale, setLocale, type TranslationKey } from './ui/i18n';
import './styles.css';

type AttemptResult = Extract<ServerMessage, { type: 'attempt_result' }>;
type ChaosEvent = Extract<ServerMessage, { type: 'chaos_event' }>;
type RoomResult = Extract<ServerMessage, { type: 'room_result' }>;
type MatchmakingState = Extract<ServerMessage, { type: 'matchmaking_state' }>;

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Missing #app root');

let locale: Locale = getInitialLocale();
let roomId = new URLSearchParams(location.search).get('room') ?? '';
let reconnectToken = roomId ? sessionStorage.getItem(`qiqihar-reconnect-${roomId}`) ?? undefined : undefined;
let localSlot: CatSlot | undefined;
let roomState: RoomSnapshot | undefined;
let latestResult: AttemptResult | undefined;
let latestChaos: ChaosEvent | undefined;
let latestRoomResult: RoomResult | undefined;
let matchmakingState: MatchmakingState | undefined;
let matchmakingRequested = false;
let connectionState: 'connecting' | 'connected' | 'disconnected' = 'connecting';
let copied = false;
let reportCopied = false;
let muted = localStorage.getItem('qiqihar-muted') === 'true';
let reducedMotion = localStorage.getItem('qiqihar-reduced-motion') === 'true' || (localStorage.getItem('qiqihar-reduced-motion') === null && matchMedia('(prefers-reduced-motion: reduce)').matches);
let networkMetrics: NetworkMetrics | undefined;
const emoteTimers = new Map<CatSlot, number>();
const socket = new SocketClient();
const audio = new AudioManager();
const playtest = new PlaytestRecorder();
audio.setMuted(muted);

function t(key: TranslationKey): string { return dictionary[locale][key]; }

app.innerHTML = `
  <div class="shell">
    <section class="game-card" aria-label="齐齐哈尔 game">
      <header class="topbar">
        <div><h1 class="brand">齐齐哈尔！</h1><p class="subtitle" id="subtitle"></p></div>
        <div class="top-actions">
          <button class="chip" id="mute" type="button"></button>
          <button class="chip" id="motion" type="button"></button>
          <button class="chip" id="locale" type="button"></button>
        </div>
      </header>
      <div class="stage-wrap">
        <div class="canvas-wrap">
          <div id="game"></div>
          <div class="stage-title" id="scene-title"></div>
          <div class="wall-board wall-record">
            <span class="wall-heading" id="record-label"></span>
            <strong class="wall-value" id="record-value">0.00 s</strong>
            <span class="wall-detail"><span id="failures-label"></span> <strong id="failures-value">0</strong></span>
          </div>
          <div class="wall-board wall-sync">
            <span class="wall-heading" id="sync-label"></span>
            <strong class="wall-value" id="sync-value">0 / 4</strong>
          </div>
          <div class="you-marker-layer" aria-hidden="true">
            <span id="you-marker-0" hidden></span><span id="you-marker-1" hidden></span><span id="you-marker-2" hidden></span><span id="you-marker-3" hidden></span>
          </div>
          <div class="slot-labels" aria-hidden="true">
            <span id="slot-label-0">P1</span><span id="slot-label-1">P2</span><span id="slot-label-2">P3</span><span id="slot-label-3">P4</span>
          </div>
          <div class="emote-layer" aria-hidden="true">
            <span id="emote-0" hidden></span><span id="emote-1" hidden></span><span id="emote-2" hidden></span><span id="emote-3" hidden></span>
          </div>
          <div class="scene-feedback" id="scene-feedback" hidden></div>
        </div>
        <div class="status" id="status" role="status"></div>
      </div>
      <div class="lobby">
        <div>
          <div class="room-line"><strong id="room-label"></strong><span class="room-code" id="room-code">——</span><button class="chip" id="copy" type="button"></button></div>
          <div class="connection" id="connection" data-state="connecting"></div>
          <div class="debug" id="debug"></div>
        </div>
        <div class="lobby-actions">
          <button class="button primary" id="matchmake" type="button"></button>
          <button class="button primary" id="quick-start" type="button"></button>
          <button class="button primary" id="replay" type="button" hidden></button>
          <button class="button" id="copy-report" type="button" hidden></button>
        </div>
      </div>
      <nav class="touch-controls" id="touch-controls">
        <button class="touch-button" id="touch-left" type="button">←</button>
        <button class="touch-button" id="touch-meow" type="button"></button>
        <button class="touch-button hiss" id="touch-hiss" type="button"></button>
        <button class="touch-button" id="touch-boop" type="button"></button>
        <button class="touch-button" id="touch-right" type="button">→</button>
      </nav>
      <div class="controls" id="controls"></div>
    </section>
  </div>`;

function element<T extends HTMLElement>(id: string): T {
  const value = document.getElementById(id);
  if (!value) throw new Error(`Missing #${id}`);
  return value as T;
}

function failureCopy(gag: FailureGag | undefined): string {
  const keys: Record<FailureGag, TranslationKey> = {
    'three-of-four': 'threeOfFour',
    'near-miss': 'nearMiss',
    chorus: 'chorus',
    'too-late': 'tooLate',
    'too-early': 'tooEarly',
    silence: 'silence',
  };
  return t(keys[gag ?? 'silence']);
}

function statusCopy(): string {
  if (connectionState !== 'connected') return t(connectionState);
  if (matchmakingState?.status === 'searching') {
    const serverNow = Date.now() + (networkMetrics?.clockOffsetMs ?? 0);
    const seconds = Math.max(0, Math.ceil(((matchmakingState.deadlineMs ?? serverNow) - serverNow) / 1000));
    return `${t('matchmaking')} ${matchmakingState.queuedPlayers}/4 · ${seconds} ${t('secondsLeft')}`;
  }
  if (!roomState || roomState.phase === 'waiting') return `${t('statusNeedPlayers')} · ${t('enterMatch')}`;
  if (latestRoomResult?.result === 'timeout') return `${t('timeout')} · ${t('enterReplay')}`;
  if (roomState.phase === 'intro' && latestChaos?.kind === 'achoo') return t('achooWarning');
  if (latestResult?.success) return `${t('success')} · ${t('enterReplay')}`;
  if (latestResult && roomState.phase === 'feedback') return `${failureCopy(latestResult.gag)} · ${t('enterContinue')}`;
  const remainingMs = remainingChallengeMs(
    roomState.challengeEndsAtMs,
    Date.now(),
    networkMetrics?.clockOffsetMs,
  );
  const remaining = `${Math.floor(remainingMs / 60_000)}:${String(Math.ceil((remainingMs % 60_000) / 1000)).padStart(2, '0')}`;
  return `${t('attempt')} ${roomState.attemptId} · ${t('statusReady')}${roomState.challengeEndsAtMs ? ` · ${t('time')} ${remaining}` : ''}`;
}

function contextShortcutCopy(): string {
  if (matchmakingState?.status === 'searching') return '';
  if (roomState?.phase === 'success' || roomState?.phase === 'timeout') return t('enterReplay');
  if (roomState?.phase === 'feedback') return t('enterContinue');
  if (!roomState || roomState.phase === 'waiting') return t('enterMatch');
  return '';
}

function sceneFeedbackCopy(): string {
  if (latestRoomResult?.result === 'timeout') return t('sceneTimeout');
  if (!latestResult) return '';
  if (latestResult.success) return t('sceneSuccess');
  if (latestResult.gag === 'three-of-four') return '3 / 4 ?!';
  if (latestResult.gag === 'near-miss') return `${(latestResult.overlapMs / 1000).toFixed(2)} s …`;
  if (latestResult.gag === 'chorus') return '♪  ?  ♪';
  return '…?';
}

function synchronizedSlotSet(): Set<CatSlot> {
  if (!latestResult) return new Set();
  return new Set(findSynchronizedSlots(latestResult.events.map((event) => ({
    slot: event.slot,
    startMs: event.activeStartMs,
    endMs: event.activeEndMs,
  }))));
}

function updateUi(): void {
  setLocale(locale);
  document.documentElement.dataset.reducedMotion = String(reducedMotion);
  const playerCount = roomState?.players.length ?? 0;
  const synchronizedSlots = synchronizedSlotSet();
  const completedAttempts = roomState?.attempts ?? 0;
  const failures = Math.max(0, completedAttempts - (roomState?.phase === 'success' ? 1 : 0));
  element('subtitle').textContent = t('subtitle');
  element('scene-title').textContent = t('sceneTitle');
  element<HTMLButtonElement>('mute').textContent = `${muted ? '🔇' : '🔈'} ${t(muted ? 'unmute' : 'mute')}`;
  element<HTMLButtonElement>('mute').setAttribute('aria-pressed', String(muted));
  element<HTMLButtonElement>('motion').textContent = `◌ ${t(reducedMotion ? 'fullMotion' : 'reduceMotion')}`;
  element<HTMLButtonElement>('motion').setAttribute('aria-pressed', String(reducedMotion));
  element<HTMLButtonElement>('locale').textContent = `文/A · ${t('language')}`;
  element('record-label').textContent = t('bestRecord');
  element('record-value').textContent = `${((roomState?.bestOverlapMs ?? 0) / 1000).toFixed(2)} s`;
  element('failures-label').textContent = t('failures');
  element('failures-value').textContent = String(failures);
  element('sync-label').textContent = t('synchronized');
  element('sync-value').textContent = `${synchronizedSlots.size} / 4`;
  element('status').textContent = statusCopy();
  const searching = matchmakingState?.status === 'searching';
  const queuedPlayers = matchmakingState?.queuedPlayers ?? 0;
  element('room-label').textContent = t(searching ? 'publicMatch' : 'room');
  element('room-code').textContent = roomId || '——';
  const copyButton = element<HTMLButtonElement>('copy');
  copyButton.textContent = copied ? t('copied') : t('copyLink');
  copyButton.hidden = searching || !roomId;
  const connection = element('connection');
  connection.dataset.state = connectionState;
  const reservedCopy = roomState?.reservedSlots.length
    ? ` · ${t('reconnecting')} #${roomState.reservedSlots.map((slot) => slot + 1).join(', #')}`
    : '';
  connection.textContent = searching
    ? `${t(connectionState)} · ${t('foundPlayers')} ${queuedPlayers}/4`
    : `${t(connectionState)} · ${roomState?.phase === 'waiting' || !roomState ? `${t('waiting')} ${playerCount}/4` : `${t('attempts')}: ${roomState.attempts}`}${reservedCopy}${localSlot !== undefined ? ` · ${t('you')} #${localSlot + 1}` : ''}`;
  const networkCopy = networkMetrics
    ? ` · ${t('latency')}: ${Math.round(networkMetrics.rttMs)} ms · ${t('clockOffset')}: ${networkMetrics.clockOffsetMs >= 0 ? '+' : ''}${Math.round(networkMetrics.clockOffsetMs)} ms`
    : '';
  element('debug').textContent = roomState
    ? `${t('best')}: ${(roomState.bestOverlapMs / 1000).toFixed(2)} s${latestResult ? ` · Δ ${(latestResult.overlapMs / 1000).toFixed(2)} s` : ''}${networkCopy}`
    : '';
  for (const slot of [0, 1, 2, 3] as const) {
    const player = roomState?.players.find((candidate) => candidate.slot === slot);
    const reserved = roomState?.reservedSlots.includes(slot);
    const x = player?.x ?? [48, 122, 198, 272][slot]!;
    const label = element(`slot-label-${slot}`);
    label.textContent = slot === localSlot ? t('you') : player?.isBot ? t('bot') : player ? `P${slot + 1}` : reserved ? '↻' : '…';
    label.style.left = `${(x / 320) * 100}%`;
    label.classList.toggle('is-you', slot === localSlot);
    label.classList.toggle('is-synchronized', synchronizedSlots.has(slot));
    const youMarker = element(`you-marker-${slot}`);
    youMarker.textContent = `${t('you')} ▼`;
    youMarker.style.left = `${(x / 320) * 100}%`;
    youMarker.hidden = slot !== localSlot;
    element(`emote-${slot}`).style.left = `${(x / 320) * 100}%`;
  }
  const sceneFeedback = element('scene-feedback');
  const sceneCopy = sceneFeedbackCopy();
  sceneFeedback.textContent = sceneCopy;
  sceneFeedback.hidden = !sceneCopy || roomState?.phase === 'playing' || roomState?.phase === 'intro';
  const matchmake = element<HTMLButtonElement>('matchmake');
  matchmake.textContent = t(searching ? 'cancelMatch' : 'randomMatch');
  matchmake.disabled = connectionState !== 'connected';
  matchmake.hidden = !searching && roomState !== undefined && !['waiting', 'success', 'timeout'].includes(roomState.phase);
  const quickStart = element<HTMLButtonElement>('quick-start');
  quickStart.textContent = t('quickStart');
  quickStart.hidden = searching || playerCount >= 4 || (roomState !== undefined && roomState.phase !== 'waiting');
  const replay = element<HTMLButtonElement>('replay');
  replay.textContent = t('replay');
  replay.hidden = roomState?.phase !== 'success' && roomState?.phase !== 'timeout';
  const report = element<HTMLButtonElement>('copy-report');
  report.textContent = t(reportCopied ? 'reportCopied' : 'copyReport');
  report.hidden = latestRoomResult === undefined;
  element('touch-controls').setAttribute('aria-label', t('touchControls'));
  element<HTMLButtonElement>('touch-left').setAttribute('aria-label', t('moveLeft'));
  element<HTMLButtonElement>('touch-right').setAttribute('aria-label', t('moveRight'));
  element<HTMLButtonElement>('touch-meow').textContent = t('meow');
  element<HTMLButtonElement>('touch-hiss').textContent = t('hiss');
  element<HTMLButtonElement>('touch-boop').textContent = t('boop');
  const shortcutCopy = contextShortcutCopy();
  element('controls').textContent = `${t('controls')}${shortcutCopy ? ` · ${shortcutCopy}` : ''}`;
}

function startRandomMatch(): void {
  if (connectionState !== 'connected' || matchmakingState?.status === 'searching') return;
  matchmakingRequested = true;
  matchmakingState = {
    type: 'matchmaking_state',
    status: 'searching',
    queuedPlayers: 1,
    deadlineMs: Date.now() + 8_000,
  };
  socket.send({ type: 'matchmake' });
  updateUi();
}

function cancelRandomMatch(): void {
  if (matchmakingState?.status !== 'searching') return;
  matchmakingRequested = false;
  socket.send({ type: 'cancel_matchmaking' });
}

function activateEnterShortcut(): boolean {
  if (connectionState !== 'connected') return false;
  const replayButton = element<HTMLButtonElement>('replay');
  if (!replayButton.hidden) {
    replayButton.click();
    return true;
  }
  if (roomState?.phase === 'feedback') {
    socket.send({ type: 'replay' });
    return true;
  }
  if (!roomState || roomState.phase === 'waiting') {
    startRandomMatch();
    return true;
  }
  return false;
}

window.addEventListener('qiqihar-enter-shortcut', activateEnterShortcut);

element<HTMLButtonElement>('locale').addEventListener('click', () => {
  locale = locale === 'zh-CN' ? 'en' : 'zh-CN';
  updateUi();
});
element<HTMLButtonElement>('mute').addEventListener('click', () => {
  muted = !muted;
  localStorage.setItem('qiqihar-muted', String(muted));
  audio.setMuted(muted);
  audio.unlock();
  updateUi();
});
element<HTMLButtonElement>('motion').addEventListener('click', () => {
  reducedMotion = !reducedMotion;
  localStorage.setItem('qiqihar-reduced-motion', String(reducedMotion));
  updateUi();
});
element<HTMLButtonElement>('copy').addEventListener('click', async () => {
  if (!roomId) return;
  await navigator.clipboard.writeText(`${location.origin}${location.pathname}?room=${roomId}`);
  copied = true;
  updateUi();
  window.setTimeout(() => { copied = false; updateUi(); }, 1_500);
});
element<HTMLButtonElement>('matchmake').addEventListener('click', () => {
  audio.unlock();
  if (matchmakingState?.status === 'searching') cancelRandomMatch();
  else startRandomMatch();
});
element<HTMLButtonElement>('quick-start').addEventListener('click', () => socket.send({ type: 'quick_start' }));
element<HTMLButtonElement>('replay').addEventListener('click', () => socket.send({ type: 'replay' }));
element<HTMLButtonElement>('copy-report').addEventListener('click', async () => {
  const report = playtest.createReport(locale, Date.now(), networkMetrics);
  if (!report) return;
  await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
  reportCopied = true;
  updateUi();
});

let touchMoveTimer: number | undefined;
function stopTouchMove(): void {
  window.clearInterval(touchMoveTimer);
  touchMoveTimer = undefined;
}
function startTouchMove(direction: -1 | 1): void {
  audio.unlock();
  stopTouchMove();
  socket.sendMove(direction);
  touchMoveTimer = window.setInterval(() => socket.sendMove(direction), 100);
}
for (const [id, direction] of [['touch-left', -1], ['touch-right', 1]] as const) {
  const button = element<HTMLButtonElement>(id);
  button.addEventListener('pointerdown', (event) => { event.preventDefault(); startTouchMove(direction); });
  button.addEventListener('pointerup', stopTouchMove);
  button.addEventListener('pointercancel', stopTouchMove);
  button.addEventListener('pointerleave', stopTouchMove);
}
for (const [id, action] of [['touch-hiss', 'hiss'], ['touch-meow', 'meow'], ['touch-boop', 'interact']] as const) {
  element<HTMLButtonElement>(id).addEventListener('pointerdown', (event) => {
    event.preventDefault();
    audio.unlock();
    socket.sendAction(action);
  });
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 320,
  height: 180,
  pixelArt: true,
  antialias: false,
  input: {
    mouse: { preventDefaultWheel: false },
    touch: { capture: false },
  },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BootScene],
});

function dispatchGameMessage(message: ServerMessage): void {
  window.dispatchEvent(new CustomEvent('qiqihar-message', { detail: { message, localSlot } }));
}

function showEmote(slot: CatSlot, copy: string): void {
  const bubble = element(`emote-${slot}`);
  bubble.textContent = copy;
  bubble.hidden = false;
  window.clearTimeout(emoteTimers.get(slot));
  emoteTimers.set(slot, window.setTimeout(() => { bubble.hidden = true; }, 900));
}

function handleMessage(message: ServerMessage): void {
  playtest.recordMessage(message, Date.now());
  if (message.type === 'joined') {
    matchmakingState = undefined;
    matchmakingRequested = false;
    roomId = message.roomId;
    localSlot = message.slot;
    reconnectToken = message.reconnectToken;
    sessionStorage.setItem(`qiqihar-reconnect-${roomId}`, reconnectToken);
    const url = new URL(location.href);
    url.searchParams.set('room', roomId);
    history.replaceState(null, '', url);
  } else if (message.type === 'matchmaking_state') {
    if (message.status === 'searching') {
      matchmakingState = message;
      matchmakingRequested = true;
      roomId = '';
      reconnectToken = undefined;
      localSlot = undefined;
      roomState = undefined;
      latestResult = undefined;
      latestChaos = undefined;
      latestRoomResult = undefined;
      const url = new URL(location.href);
      url.searchParams.delete('room');
      history.replaceState(null, '', url);
    } else {
      matchmakingState = undefined;
      matchmakingRequested = false;
    }
  } else if (message.type === 'room_state') {
    const replayStarted = (message.state.phase === 'playing' || message.state.phase === 'intro')
      && (roomState?.phase === 'success' || roomState?.phase === 'timeout');
    if (message.state.attemptId !== roomState?.attemptId || replayStarted) {
      latestResult = undefined;
      latestRoomResult = undefined;
      reportCopied = false;
    }
    if (message.state.phase === 'playing') {
      latestChaos = undefined;
    }
    roomState = message.state;
  } else if (message.type === 'attempt_result') {
    latestResult = message;
    if (message.success) audio.playWin(); else audio.playFail(message.gag);
  } else if (message.type === 'player_moved') {
    const player = roomState?.players.find((candidate) => candidate.slot === message.slot);
    if (player) player.x = message.x;
  } else if (message.type === 'social_action') {
    showEmote(message.slot, t('meowBubble'));
    audio.playMeow(message.slot);
  } else if (message.type === 'interaction') {
    showEmote(message.toSlot, t('boopBubble'));
    audio.playBoop();
  } else if (message.type === 'chaos_event') {
    latestChaos = message;
    message.affectedSlots.forEach((slot) => showEmote(slot, t('achooBubble')));
    audio.playAchoo();
  } else if (message.type === 'hiss_started') {
    audio.playHiss(message.slot);
  } else if (message.type === 'room_result') {
    latestRoomResult = message;
    if (message.result === 'timeout') audio.playFail();
  }
  dispatchGameMessage(message);
  updateUi();
}

socket.onMessage = handleMessage;
socket.onMetrics = (metrics) => { networkMetrics = metrics; updateUi(); };
socket.onState = (state) => {
  if (state === 'disconnected') playtest.recordDisconnect();
  connectionState = state;
  updateUi();
  if (state === 'connected') {
    if (matchmakingRequested) socket.send({ type: 'matchmake' });
    else socket.send({
      type: 'join',
      ...(roomId ? { roomId } : {}),
      ...(reconnectToken ? { reconnectToken } : {}),
    });
  }
};

window.addEventListener('keydown', (event) => {
  audio.unlock();
  const movement = event.code === 'KeyA' || event.code === 'ArrowLeft' || event.code === 'KeyD' || event.code === 'ArrowRight';
  if (event.repeat && !movement) return;
  if (event.code === 'Enter') {
    if (activateEnterShortcut()) event.preventDefault();
    return;
  }
  if (event.code === 'Space') { event.preventDefault(); socket.sendAction('hiss'); }
  if (event.code === 'KeyE') socket.sendAction('meow');
  if (event.code === 'KeyF') socket.sendAction('interact');
  if (event.code === 'KeyA' || event.code === 'ArrowLeft') { event.preventDefault(); socket.sendMove(-1); }
  if (event.code === 'KeyD' || event.code === 'ArrowRight') { event.preventDefault(); socket.sendMove(1); }
}, { capture: true });

updateUi();
socket.connect();
window.setInterval(() => {
  if (roomState?.challengeEndsAtMs || matchmakingState?.status === 'searching') updateUi();
}, 250);
