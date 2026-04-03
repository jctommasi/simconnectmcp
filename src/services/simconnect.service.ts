import { EventEmitter } from 'node:events';
import { open, type SimConnectConnection, Protocol } from 'node-simconnect';
import { config } from '../config.js';
import { Logger } from '../logger.js';

export interface SimConnectServiceEvents {
  connected: (simName: string) => void;
  disconnected: () => void;
  error: (error: Error) => void;
  reconnecting: (attempt: number, delayMs: number) => void;
}

const APP_NAME = 'simconnect-mcp-server';

export class SimConnectService extends EventEmitter {
  private static _instance: SimConnectService | undefined;

  private _handle: SimConnectConnection | null = null;
  private _connected = false;
  private _simName = '';
  private _connectedAt: number | null = null;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _reconnectAttempt = 0;
  private _shouldReconnect = false;
  private readonly _maxReconnectDelay: number;
  private readonly _logger: Logger;

  private constructor() {
    super();
    this._maxReconnectDelay = config.reconnectMaxDelayMs;
    this._logger = new Logger(config.logLevel);
  }

  static getInstance(): SimConnectService {
    if (!SimConnectService._instance) {
      SimConnectService._instance = new SimConnectService();
    }
    return SimConnectService._instance;
  }

  get isConnected(): boolean {
    return this._connected;
  }

  get simName(): string {
    return this._simName;
  }

  get connectedAt(): number | null {
    return this._connectedAt;
  }

  getSimConnectInstance(): SimConnectConnection | null {
    return this._handle;
  }

  async connect(): Promise<{ connected: boolean; simName: string }> {
    if (this._connected && this._handle) {
      return { connected: true, simName: this._simName };
    }

    this._shouldReconnect = true;
    this._reconnectAttempt = 0;
    this._clearReconnectTimer();

    return this._attemptConnection();
  }

  async disconnect(): Promise<void> {
    this._shouldReconnect = false;
    this._clearReconnectTimer();

    if (this._handle) {
      try {
        this._handle.close();
      } catch (err: unknown) {
        this._logger.warn('Error closing SimConnect connection', err);
      }
    }

    this._cleanup();
  }

  private async _attemptConnection(): Promise<{ connected: boolean; simName: string }> {
    try {
      this._logger.info('Connecting to SimConnect...');

      const { handle, recvOpen } = await open(APP_NAME, Protocol.KittyHawk);

      this._handle = handle;
      this._simName = recvOpen.applicationName;
      this._connected = true;
      this._connectedAt = Date.now();
      this._reconnectAttempt = 0;

      this._setupEventListeners(handle);

      this._logger.info(`Connected to SimConnect: ${this._simName}`);
      this.emit('connected', this._simName);

      return { connected: true, simName: this._simName };
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      this._logger.error('SimConnect connection failed', error.message);
      this.emit('error', error);

      if (this._shouldReconnect) {
        this._scheduleReconnect();
      }

      return { connected: false, simName: '' };
    }
  }

  private _setupEventListeners(handle: SimConnectConnection): void {
    handle.on('close', () => {
      this._logger.info('SimConnect connection closed');
      this._cleanup();
      this.emit('disconnected');

      if (this._shouldReconnect) {
        this._scheduleReconnect();
      }
    });

    handle.on('error', (error: Error) => {
      this._logger.error('SimConnect error', error.message);
      this.emit('error', error);
    });

    handle.on('quit', () => {
      this._logger.info('Simulator quit');
      this._cleanup();
      this.emit('disconnected');

      if (this._shouldReconnect) {
        this._scheduleReconnect();
      }
    });
  }

  private _scheduleReconnect(): void {
    this._clearReconnectTimer();
    this._reconnectAttempt++;

    const delayMs = Math.min(
      1000 * Math.pow(2, this._reconnectAttempt - 1),
      this._maxReconnectDelay
    );

    this._logger.info(
      `Reconnecting in ${delayMs}ms (attempt ${this._reconnectAttempt})...`
    );
    this.emit('reconnecting', this._reconnectAttempt, delayMs);

    this._reconnectTimer = setTimeout(() => {
      this._attemptConnection().catch((err: unknown) => {
        this._logger.error('Reconnection attempt failed', err);
      });
    }, delayMs);
  }

  private _clearReconnectTimer(): void {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  }

  private _cleanup(): void {
    this._connected = false;
    this._handle = null;
    this._simName = '';
    this._connectedAt = null;
  }

  // Typed event emitter overrides
  override on<K extends keyof SimConnectServiceEvents>(
    event: K,
    listener: SimConnectServiceEvents[K]
  ): this {
    return super.on(event, listener);
  }

  override emit<K extends keyof SimConnectServiceEvents>(
    event: K,
    ...args: Parameters<SimConnectServiceEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }
}
