import type { ClientMessage, ServerMessage } from '@qiqihar/shared';

type MessageHandler = (message: ServerMessage) => void;
type StateHandler = (state: 'connecting' | 'connected' | 'disconnected') => void;
export interface NetworkMetrics { rttMs: number; clockOffsetMs: number }
type MetricsHandler = (metrics: NetworkMetrics) => void;

export function defaultWebSocketUrl(location: Pick<Location, 'protocol' | 'hostname'>): string {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${location.hostname}:8080`;
}

export class SocketClient {
  private socket?: WebSocket;
  private sequence = 0;
  private reconnectTimer?: number;
  private pingTimer?: number;
  private smoothedRtt?: number;
  private smoothedOffset?: number;
  onMessage?: MessageHandler;
  onState?: StateHandler;
  onMetrics?: MetricsHandler;

  connect(): void {
    window.clearTimeout(this.reconnectTimer);
    this.onState?.('connecting');
    const url = import.meta.env.VITE_WS_URL ?? defaultWebSocketUrl(window.location);
    this.socket = new WebSocket(url);
    this.socket.addEventListener('open', () => {
      this.onState?.('connected');
      this.sendPing();
      window.clearInterval(this.pingTimer);
      this.pingTimer = window.setInterval(() => this.sendPing(), 2_000);
    });
    this.socket.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(String(event.data)) as ServerMessage;
        if (message.type === 'pong') this.handlePong(message);
        else this.onMessage?.(message);
      } catch { /* Ignore malformed server frames. */ }
    });
    this.socket.addEventListener('close', () => {
      window.clearInterval(this.pingTimer);
      this.onState?.('disconnected');
      this.reconnectTimer = window.setTimeout(() => this.connect(), 2_000);
    });
  }

  send(message: ClientMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }

  sendAction(action: 'hiss' | 'meow' | 'interact'): void {
    this.send({
      type: 'action',
      seq: this.sequence++,
      action,
      estimatedServerTimeMs: Date.now() + (this.smoothedOffset ?? 0),
    });
  }

  sendMove(direction: -1 | 0 | 1): void {
    this.send({ type: 'move', seq: this.sequence++, direction });
  }

  private sendPing(): void {
    this.send({ type: 'ping', seq: this.sequence++, clientTimeMs: Date.now() });
  }

  private handlePong(message: Extract<ServerMessage, { type: 'pong' }>): void {
    const receivedAtMs = Date.now();
    const rttMs = Math.max(0, receivedAtMs - message.clientTimeMs);
    const clockOffsetMs = message.serverTimeMs - (message.clientTimeMs + rttMs / 2);
    const smoothing = 0.25;
    this.smoothedRtt = this.smoothedRtt === undefined ? rttMs : this.smoothedRtt * (1 - smoothing) + rttMs * smoothing;
    this.smoothedOffset = this.smoothedOffset === undefined ? clockOffsetMs : this.smoothedOffset * (1 - smoothing) + clockOffsetMs * smoothing;
    this.onMetrics?.({ rttMs: this.smoothedRtt, clockOffsetMs: this.smoothedOffset });
  }
}

