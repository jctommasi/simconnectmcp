import {
  ClientDataPeriod,
  ClientDataRequestFlag,
  EventFlag,
  RawBuffer,
  SimConnectConstants,
} from 'node-simconnect';
import { SimConnectService } from './simconnect.service.js';
import { Logger } from '../logger.js';
import { config } from '../config.js';

// ── WASimCommander CDA protocol constants ──────────────────────────────

const CLIENT_ID = 0x4d435053; // "MCPS" in ASCII
const CLIENT_HEX = '4D435053';

const CDA_NAME_COMMAND = `WASimCommander.Command.${CLIENT_HEX}`;
const CDA_NAME_RESPONSE = `WASimCommander.Response.${CLIENT_HEX}`;
const EVENT_NAME_CONNECT = 'WASimCommander.Connect';
const EVENT_NAME_PING = 'WASimCommander.Ping';

const STRUCT_SIZE = 544;
const SDATA_MAX_LEN = 527;

/** WASimCommander command IDs */
const enum CommandId {
  Ack = 1,
  Nak = 2,
  Ping = 3,
  Connect = 4,
  Disconnect = 5,
  Get = 8,
  GetCreate = 9,
  Set = 10,
  SetCreate = 11,
  Exec = 12,
}

/** WASimCommander calculator result types (passed in uData for Exec) */
const enum CalcResultType {
  None = 0,
  Double = 1,
  String = 2,
  Formatted = 3,
}

// ID ranges – 7000+ to avoid collisions with simvar (1000+), subscriptions (3000+), events (5000+)
const WASIM_CDA_ID_COMMAND = 7000;
const WASIM_CDA_ID_RESPONSE = 7001;
const WASIM_DEF_ID_COMMAND = 7002;
const WASIM_DEF_ID_RESPONSE = 7003;
const WASIM_REQ_ID_RESPONSE = 7004;
const WASIM_EVENT_ID_CONNECT = 7005;
const WASIM_EVENT_ID_PING = 7006;

const CONNECT_TIMEOUT_MS = 5000;
const COMMAND_TIMEOUT_MS = 10000;

// ── Types ──────────────────────────────────────────────────────────────

interface PendingCommand {
  resolve: (response: WaSimResponse) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface WaSimResponse {
  token: number;
  uData: number;
  fData: number;
  commandId: number;
  sData: string;
}

// ── Service ────────────────────────────────────────────────────────────

/**
 * WASimCommander bridge service for extended variable access.
 * Implements the WASimCommander client-server protocol over SimConnect
 * Client Data Areas (CDAs), providing access to L: variables, H: events,
 * and RPN calculator code via the WASimCommander WASM module in MSFS 2024.
 */
export class WASimService {
  private static _instance: WASimService | undefined;

  private readonly _simConnect: SimConnectService;
  private readonly _logger: Logger;
  private _available = false;
  private _nextToken = 1;
  private readonly _pending = new Map<number, PendingCommand>();
  private _connectResolver: ((value: boolean) => void) | null = null;

  private constructor(simConnectService: SimConnectService) {
    this._simConnect = simConnectService;
    this._logger = new Logger(config.logLevel);
  }

  static getInstance(): WASimService {
    if (!WASimService._instance) {
      WASimService._instance = new WASimService(
        SimConnectService.getInstance()
      );
    }
    return WASimService._instance;
  }

  get isAvailable(): boolean {
    return this._available;
  }

  /**
   * Connect to the WASimCommander WASM module via the CDA protocol.
   * Call this after SimConnect is connected.
   */
  async initialize(): Promise<void> {
    if (!this._simConnect.isConnected) {
      this._logger.debug(
        'WASimCommander: SimConnect not connected, skipping initialization'
      );
      this._available = false;
      return;
    }

    // Reset any previous state (e.g. after reconnect)
    this._reset();

    try {
      const handle = this._simConnect.getSimConnectInstance()!;

      // 1. Map event names to client event IDs
      handle.mapClientEventToSimEvent(
        WASIM_EVENT_ID_CONNECT,
        EVENT_NAME_CONNECT
      );
      handle.mapClientEventToSimEvent(WASIM_EVENT_ID_PING, EVENT_NAME_PING);

      // 2. Map CDA names to IDs
      handle.mapClientDataNameToID(CDA_NAME_COMMAND, WASIM_CDA_ID_COMMAND);
      handle.mapClientDataNameToID(CDA_NAME_RESPONSE, WASIM_CDA_ID_RESPONSE);

      // 3. Create both CDAs (544 bytes, writable by WASM module)
      handle.createClientData(WASIM_CDA_ID_COMMAND, STRUCT_SIZE, false);
      handle.createClientData(WASIM_CDA_ID_RESPONSE, STRUCT_SIZE, false);

      // 4. Define data layout: single 544-byte block at offset 0
      handle.addToClientDataDefinition(WASIM_DEF_ID_COMMAND, 0, STRUCT_SIZE);
      handle.addToClientDataDefinition(WASIM_DEF_ID_RESPONSE, 0, STRUCT_SIZE);

      // 5. Subscribe to Response CDA (notified each time WASM writes to it)
      handle.requestClientData(
        WASIM_CDA_ID_RESPONSE,
        WASIM_REQ_ID_RESPONSE,
        WASIM_DEF_ID_RESPONSE,
        ClientDataPeriod.ON_SET,
        ClientDataRequestFlag.CLIENT_DATA_REQUEST_FLAG_DEFAULT
      );

      // 6. Listen for response data
      handle.on(
        'clientData',
        (recv: { requestID: number; data: RawBuffer }) => {
          if (recv.requestID === WASIM_REQ_ID_RESPONSE) {
            this._handleResponse(recv.data);
          }
        }
      );

      // 7. Fire the Connect event (WASM module picks up our client ID)
      handle.transmitClientEvent(
        SimConnectConstants.OBJECT_ID_USER,
        WASIM_EVENT_ID_CONNECT,
        CLIENT_ID,
        1,
        EventFlag.EVENT_FLAG_GROUPID_IS_PRIORITY
      );

      // 8. Wait for Ack from WASM module
      const connected = await this._waitForConnectAck();

      if (connected) {
        this._available = true;
        this._logger.info(
          'WASimCommander WASM module connected via CDA protocol'
        );
      } else {
        this._reset();
        this._logger.info(
          'WASimCommander WASM module not available — L:var, H:event, and calculator features disabled'
        );
      }
    } catch (err) {
      this._reset();
      const msg = err instanceof Error ? err.message : String(err);
      this._logger.info(`WASimCommander initialization failed: ${msg}`);
    }
  }

  // ── Public API ───────────────────────────────────────────────────────

  /**
   * Read an L: (local) variable by name.
   * @returns The numeric value of the L:var
   */
  async getLvar(name: string): Promise<number> {
    this._ensureAvailable();
    this._ensureConnected();
    this._logger.debug(`Reading L:var: ${name}`);

    const response = await this._sendCommand({
      commandId: CommandId.Get,
      uData: 'L'.charCodeAt(0),
      sData: name,
    });

    return response.fData;
  }

  /**
   * Write an L: (local) variable by name.
   */
  async setLvar(name: string, value: number): Promise<void> {
    this._ensureAvailable();
    this._ensureConnected();
    this._logger.debug(`Writing L:var: ${name} = ${value}`);

    await this._sendCommand({
      commandId: CommandId.SetCreate,
      uData: 'L'.charCodeAt(0),
      fData: value,
      sData: name,
    });
  }

  /**
   * Trigger an H: (HTML/gauge) event by name.
   */
  async triggerHEvent(name: string): Promise<void> {
    this._ensureAvailable();
    this._ensureConnected();
    this._logger.debug(`Triggering H:event: ${name}`);

    await this._sendCommand({
      commandId: CommandId.Exec,
      uData: CalcResultType.None,
      sData: `(>H:${name})`,
    });
  }

  /**
   * Execute RPN calculator code and return the string result.
   */
  async executeCalcCode(code: string): Promise<string> {
    this._ensureAvailable();
    this._ensureConnected();
    this._logger.debug(`Executing calculator code: ${code}`);

    const response = await this._sendCommand({
      commandId: CommandId.Exec,
      uData: CalcResultType.Formatted,
      sData: code,
    });

    return response.sData;
  }

  // ── Protocol internals ───────────────────────────────────────────────

  /**
   * Build a 544-byte command buffer, write it to the Command CDA,
   * and wait for the matching response on the Response CDA.
   */
  private _sendCommand(opts: {
    commandId: number;
    uData?: number;
    fData?: number;
    sData?: string;
  }): Promise<WaSimResponse> {
    const handle = this._simConnect.getSimConnectInstance()!;
    const token = this._nextToken++;

    // Pack the command struct into a 544-byte buffer
    const buf = Buffer.alloc(STRUCT_SIZE);
    buf.writeUInt32LE(token, 0); // offset 0: token
    buf.writeUInt32LE(opts.uData ?? 0, 4); // offset 4: uData
    buf.writeDoubleLE(opts.fData ?? 0, 8); // offset 8: fData
    buf.writeUInt8(opts.commandId, 16); // offset 16: commandId
    if (opts.sData) {
      // offset 17: sData (null-terminated, buffer is zero-filled)
      buf.write(opts.sData, 17, SDATA_MAX_LEN - 1, 'utf8');
    }

    return new Promise<WaSimResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pending.delete(token);
        reject(new Error(`WASimCommander command timed out (token=${token})`));
      }, COMMAND_TIMEOUT_MS);

      this._pending.set(token, { resolve, reject, timer });

      // Write command to the Command CDA
      handle.setClientData(
        WASIM_CDA_ID_COMMAND,
        WASIM_DEF_ID_COMMAND,
        0, // reserved
        0, // arrayCount
        STRUCT_SIZE,
        buf
      );
    });
  }

  /**
   * Parse a 544-byte response from the Response CDA and resolve/reject
   * the matching pending command.
   */
  private _handleResponse(data: RawBuffer): void {
    const token = data.readUint32();
    const uData = data.readUint32();
    const fData = data.readFloat64();
    const commandId = data.readBytes(1)[0]; // uint8
    const sDataBytes = data.readBytes(SDATA_MAX_LEN);
    const nullIdx = sDataBytes.indexOf(0);
    const sData = sDataBytes.toString(
      'utf8',
      0,
      nullIdx >= 0 ? nullIdx : SDATA_MAX_LEN
    );

    this._logger.debug(
      `WASimCommander response: token=${token} cmd=${commandId} fData=${fData} sData="${sData.substring(0, 60)}"`
    );

    // During the connect handshake, resolve on first Ack
    if (this._connectResolver && commandId === CommandId.Ack) {
      const resolve = this._connectResolver;
      this._connectResolver = null;
      resolve(true);
      return;
    }

    const response: WaSimResponse = { token, uData, fData, commandId, sData };

    if (commandId === CommandId.Nak) {
      const pending = this._pending.get(token);
      if (pending) {
        clearTimeout(pending.timer);
        this._pending.delete(token);
        pending.reject(new Error(`WASimCommander command rejected (Nak): ${sData}`));
      }
      return;
    }

    const pending = this._pending.get(token);
    if (pending) {
      clearTimeout(pending.timer);
      this._pending.delete(token);
      pending.resolve(response);
    }
  }

  private _waitForConnectAck(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        this._connectResolver = null;
        resolve(false);
      }, CONNECT_TIMEOUT_MS);

      this._connectResolver = (value: boolean) => {
        clearTimeout(timer);
        resolve(value);
      };
    });
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  private _reset(): void {
    for (const [, pending] of this._pending) {
      clearTimeout(pending.timer);
    }
    this._pending.clear();
    this._available = false;
    this._connectResolver = null;
  }

  private _ensureAvailable(): void {
    if (!this._available) {
      throw new Error(
        'WASimCommander is not available. The WASM module may not be installed in the MSFS Community folder.'
      );
    }
  }

  private _ensureConnected(): void {
    if (!this._simConnect.isConnected) {
      throw new Error(
        'Not connected to SimConnect. Use simconnect_connect first.'
      );
    }
  }
}
