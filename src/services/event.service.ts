import {
  SimConnectConstants,
  EventFlag,
} from 'node-simconnect';
import { SimConnectService } from './simconnect.service.js';
import { Logger } from '../logger.js';
import { config } from '../config.js';

export class EventService {
  private readonly _simConnect: SimConnectService;
  private readonly _logger: Logger;

  /** Maps event name strings to their assigned client event IDs */
  private readonly _eventIdCache = new Map<string, number>();

  /** Monotonically increasing ID for client event mapping */
  private _nextEventId = 5000;

  constructor(simConnectService: SimConnectService) {
    this._simConnect = simConnectService;
    this._logger = new Logger(config.logLevel);
  }

  /**
   * Dispatch a Key Event to the simulator.
   * Automatically maps the event name to a client event ID on first use.
   */
  async sendEvent(eventName: string, data?: number): Promise<void> {
    this._ensureConnected();

    const handle = this._simConnect.getSimConnectInstance()!;
    const eventId = this._getOrMapEvent(eventName);

    handle.transmitClientEvent(
      SimConnectConstants.OBJECT_ID_USER,
      eventId,
      data ?? 0,
      1,
      EventFlag.EVENT_FLAG_GROUPID_IS_PRIORITY
    );

    this._logger.debug(
      `Sent event ${eventName} (id=${eventId}) with data=${data ?? 0}`
    );
  }

  /**
   * Get or create a client event mapping for the given event name.
   * Caches the mapping so repeated calls don't re-register.
   */
  private _getOrMapEvent(eventName: string): number {
    const upperName = eventName.toUpperCase();
    const cached = this._eventIdCache.get(upperName);
    if (cached !== undefined) {
      return cached;
    }

    const handle = this._simConnect.getSimConnectInstance()!;
    const eventId = this._nextEventId++;

    handle.mapClientEventToSimEvent(eventId, upperName);
    this._eventIdCache.set(upperName, eventId);

    this._logger.debug(`Mapped event ${upperName} -> clientEventId ${eventId}`);
    return eventId;
  }

  private _ensureConnected(): void {
    if (!this._simConnect.isConnected) {
      throw new Error(
        'Not connected to SimConnect. Use simconnect_connect first.'
      );
    }
  }
}
