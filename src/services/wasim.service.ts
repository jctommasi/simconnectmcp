import { SimConnectService } from './simconnect.service.js';
import { Logger } from '../logger.js';
import { config } from '../config.js';

/**
 * WASimCommander bridge service for extended variable access.
 * Provides access to L: variables, H: events, and RPN calculator code
 * via the WASimCommander WASM module in MSFS 2024.
 *
 * Gracefully degrades when WASimCommander is not available —
 * the server starts and works normally, these features just return
 * 'WASimCommander not available' errors.
 */
export class WASimService {
  private static _instance: WASimService | undefined;

  private readonly _simConnect: SimConnectService;
  private readonly _logger: Logger;
  private _available = false;

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

  /**
   * Whether the WASimCommander WASM module is connected and available.
   */
  get isAvailable(): boolean {
    return this._available;
  }

  /**
   * Attempt to detect and connect to the WASimCommander WASM module.
   * Call this after SimConnect is connected.
   * Currently WASimCommander has no native Node.js client library,
   * so this checks for future availability.
   */
  async initialize(): Promise<void> {
    if (!this._simConnect.isConnected) {
      this._logger.debug(
        'WASimCommander: SimConnect not connected, skipping initialization'
      );
      this._available = false;
      return;
    }

    try {
      // Attempt dynamic import of a WASimCommander client library.
      // This will succeed if/when a Node.js WASimCommander package becomes available.
      await import('wasim-client' as string);
      this._available = true;
      this._logger.info('WASimCommander WASM module detected and connected');
    } catch {
      this._available = false;
      this._logger.info(
        'WASimCommander WASM module not available — L:var, H:event, and calculator features disabled'
      );
    }
  }

  /**
   * Read an L: (local) variable by name.
   * L:vars are aircraft-specific variables used by complex add-on aircraft
   * (e.g., PMDG, FlyByWire) for internal state.
   *
   * @param name - The L:var name (e.g., "XMLVAR_Baro1_Mode", "A32NX_EFIS_L_OPTION")
   * @returns The numeric value of the L:var
   * @throws If WASimCommander is not available or SimConnect is not connected
   */
  async getLvar(name: string): Promise<number> {
    this._ensureAvailable();
    this._ensureConnected();

    this._logger.debug(`Reading L:var: ${name}`);

    // Placeholder for actual WASimCommander implementation.
    // When a Node.js WASimCommander client is available, this would call:
    //   wasimClient.getLvar(name)
    throw new Error(
      `WASimCommander getLvar not implemented — no native Node.js client library available. ` +
        `Cannot read L:${name}`
    );
  }

  /**
   * Write an L: (local) variable by name.
   * L:vars are aircraft-specific variables used by complex add-on aircraft.
   *
   * @param name - The L:var name
   * @param value - The numeric value to set
   * @throws If WASimCommander is not available or SimConnect is not connected
   */
  async setLvar(name: string, value: number): Promise<void> {
    this._ensureAvailable();
    this._ensureConnected();

    this._logger.debug(`Writing L:var: ${name} = ${value}`);

    // Placeholder for actual WASimCommander implementation.
    throw new Error(
      `WASimCommander setLvar not implemented — no native Node.js client library available. ` +
        `Cannot write L:${name} = ${value}`
    );
  }

  /**
   * Trigger an H: (HTML/gauge) event by name.
   * H:events are used by complex add-on aircraft for cockpit interactions
   * that aren't exposed through standard SimConnect Key Events.
   *
   * @param name - The H:event name (e.g., "A32NX_EFIS_L_CHRONO_PUSHED")
   * @throws If WASimCommander is not available or SimConnect is not connected
   */
  async triggerHEvent(name: string): Promise<void> {
    this._ensureAvailable();
    this._ensureConnected();

    this._logger.debug(`Triggering H:event: ${name}`);

    // Placeholder for actual WASimCommander implementation.
    throw new Error(
      `WASimCommander triggerHEvent not implemented — no native Node.js client library available. ` +
        `Cannot trigger H:${name}`
    );
  }

  /**
   * Execute RPN (Reverse Polish Notation) calculator code.
   * Calculator code is the most powerful interface to MSFS internals,
   * allowing reading/writing of any variable type and complex operations.
   *
   * @param code - The RPN calculator code string (e.g., "(A:PLANE ALTITUDE,feet) 1000 +")
   * @returns The result of the calculator execution as a string
   * @throws If WASimCommander is not available or SimConnect is not connected
   */
  async executeCalcCode(code: string): Promise<string> {
    this._ensureAvailable();
    this._ensureConnected();

    this._logger.debug(`Executing calculator code: ${code}`);

    // Placeholder for actual WASimCommander implementation.
    throw new Error(
      `WASimCommander executeCalcCode not implemented — no native Node.js client library available. ` +
        `Cannot execute: ${code}`
    );
  }

  private _ensureAvailable(): void {
    if (!this._available) {
      throw new Error(
        'WASimCommander is not available. The WASM module may not be installed in MSFS, ' +
          'or no compatible Node.js client library is present. ' +
          'Install the WASimCommander WASM module in your MSFS Community folder and ensure a Node.js client package is available.'
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
