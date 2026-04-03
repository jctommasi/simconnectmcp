import {
  SimConnectConstants,
  SimConnectDataType,
  SimConnectPeriod,
  RawBuffer,
} from 'node-simconnect';
import type { RecvSimObjectData } from 'node-simconnect';
import { SimConnectService } from './simconnect.service.js';
import { config } from '../config.js';
import { Logger } from '../logger.js';

/** Cache key for a SimVar+unit combination */
function cacheKey(name: string, unit: string): string {
  return `${name.toUpperCase()}::${unit.toLowerCase()}`;
}

interface DefinitionEntry {
  definitionId: number;
  requestId: number;
  dataType: SimConnectDataType;
}

export class SimVarService {
  private readonly _simConnect: SimConnectService;
  private readonly _logger: Logger;

  /** Maps simvar+unit cache keys to their registered definition entries */
  private readonly _definitionCache = new Map<string, DefinitionEntry>();

  /** Stores the latest values received from subscriptions */
  private readonly _subscribedValues = new Map<string, number | string>();

  /** Monotonically increasing IDs for SimConnect definitions and requests */
  private _nextDefinitionId = 1000;
  private _nextRequestId = 1000;

  /** Pending one-shot read promises keyed by requestId */
  private readonly _pendingReads = new Map<
    number,
    {
      resolve: (value: number | string) => void;
      reject: (reason: Error) => void;
      dataType: SimConnectDataType;
    }
  >();

  /** Pending batch read promises keyed by requestId */
  private readonly _pendingBatchReads = new Map<
    number,
    {
      resolve: (value: Record<string, number | string>) => void;
      reject: (reason: Error) => void;
      vars: Array<{ name: string; unit: string }>;
      dataTypes: SimConnectDataType[];
    }
  >();

  /** Whether we've attached the simObjectData listener */
  private _listenerAttached = false;

  constructor(simConnectService: SimConnectService) {
    this._simConnect = simConnectService;
    this._logger = new Logger(config.logLevel);
  }

  /**
   * Read a single SimVar value.
   * Returns the cached subscription value if available, otherwise does a one-shot read.
   */
  async getSimVar(
    name: string,
    unit: string
  ): Promise<number | string> {
    this._ensureConnected();

    // Check if we have a subscribed (cached) value
    const key = cacheKey(name, unit);
    if (this._subscribedValues.has(key)) {
      return this._subscribedValues.get(key)!;
    }

    return this._readOnce(name, unit);
  }

  /**
   * Read multiple SimVars in a single batch request.
   */
  async getSimVars(
    vars: Array<{ name: string; unit: string }>
  ): Promise<Record<string, number | string>> {
    this._ensureConnected();

    if (vars.length === 0) {
      return {};
    }

    // Check if all values are available from subscriptions
    const result: Record<string, number | string> = {};
    const missing: Array<{ name: string; unit: string }> = [];
    for (const v of vars) {
      const key = cacheKey(v.name, v.unit);
      if (this._subscribedValues.has(key)) {
        result[v.name] = this._subscribedValues.get(key)!;
      } else {
        missing.push(v);
      }
    }

    if (missing.length === 0) {
      return result;
    }

    // Batch read the missing vars
    const batchResult = await this._readBatch(missing);
    return { ...result, ...batchResult };
  }

  /**
   * Write a SimVar value.
   */
  async setSimVar(
    name: string,
    unit: string,
    value: number | string
  ): Promise<void> {
    this._ensureConnected();

    const handle = this._simConnect.getSimConnectInstance()!;
    const dataType = this._inferDataType(name, unit, value);
    const defId = this._allocateDefinitionId();

    handle.addToDataDefinition(defId, name, unit, dataType);

    const buffer = new RawBuffer(256);
    this._writeValueToBuffer(buffer, value, dataType);

    handle.setDataOnSimObject(
      defId,
      SimConnectConstants.OBJECT_ID_USER,
      { buffer, arrayCount: 0, tagged: false }
    );

    // Clean up the write definition
    handle.clearDataDefinition(defId);

    this._logger.debug(`Set SimVar ${name} (${unit}) = ${String(value)}`);
  }

  /**
   * Store a subscription value in the cache (used by subscription tools).
   */
  setCachedValue(name: string, unit: string, value: number | string): void {
    this._subscribedValues.set(cacheKey(name, unit), value);
  }

  /**
   * Remove a cached subscription value.
   */
  removeCachedValue(name: string, unit: string): void {
    this._subscribedValues.delete(cacheKey(name, unit));
  }

  private _ensureConnected(): void {
    if (!this._simConnect.isConnected) {
      throw new Error(
        'Not connected to SimConnect. Use simconnect_connect first.'
      );
    }
  }

  private _ensureListener(): void {
    if (this._listenerAttached) return;

    const handle = this._simConnect.getSimConnectInstance();
    if (!handle) return;

    handle.on('simObjectData', (recv: RecvSimObjectData) => {
      this._handleSimObjectData(recv);
    });

    this._listenerAttached = true;
  }

  /**
   * Get or create a cached data definition for a single SimVar+unit combo.
   * Avoids re-registering the same definition with SimConnect.
   */
  private _getOrCreateDefinition(
    name: string,
    unit: string
  ): DefinitionEntry {
    const key = cacheKey(name, unit);
    const cached = this._definitionCache.get(key);
    if (cached) return cached;

    const handle = this._simConnect.getSimConnectInstance()!;
    const dataType = this._inferDataType(name, unit);
    const defId = this._allocateDefinitionId();
    const reqId = this._allocateRequestId();

    handle.addToDataDefinition(defId, name, unit, dataType);

    const entry: DefinitionEntry = { definitionId: defId, requestId: reqId, dataType };
    this._definitionCache.set(key, entry);
    return entry;
  }

  /**
   * Read a single SimVar via a one-shot request.
   * Reuses cached data definitions to avoid re-registering.
   */
  private _readOnce(name: string, unit: string): Promise<number | string> {
    this._ensureListener();

    const handle = this._simConnect.getSimConnectInstance()!;
    const entry = this._getOrCreateDefinition(name, unit);
    const reqId = this._allocateRequestId();

    handle.requestDataOnSimObject(
      reqId,
      entry.definitionId,
      SimConnectConstants.OBJECT_ID_USER,
      SimConnectPeriod.ONCE
    );

    return new Promise<number | string>((resolve, reject) => {
      this._pendingReads.set(reqId, { resolve, reject, dataType: entry.dataType });

      // Timeout after 10 seconds
      setTimeout(() => {
        if (this._pendingReads.has(reqId)) {
          this._pendingReads.delete(reqId);
          reject(new Error(`Timeout reading SimVar: ${name}`));
        }
      }, 10000);
    });
  }

  /**
   * Read multiple SimVars in a single batch data definition.
   */
  private _readBatch(
    vars: Array<{ name: string; unit: string }>
  ): Promise<Record<string, number | string>> {
    this._ensureListener();

    const handle = this._simConnect.getSimConnectInstance()!;
    const defId = this._allocateDefinitionId();
    const reqId = this._allocateRequestId();
    const dataTypes: SimConnectDataType[] = [];

    for (const v of vars) {
      const dt = this._inferDataType(v.name, v.unit);
      dataTypes.push(dt);
      handle.addToDataDefinition(defId, v.name, v.unit, dt);
    }

    handle.requestDataOnSimObject(
      reqId,
      defId,
      SimConnectConstants.OBJECT_ID_USER,
      SimConnectPeriod.ONCE
    );

    return new Promise<Record<string, number | string>>((resolve, reject) => {
      this._pendingBatchReads.set(reqId, {
        resolve,
        reject,
        vars,
        dataTypes,
      });

      setTimeout(() => {
        if (this._pendingBatchReads.has(reqId)) {
          this._pendingBatchReads.delete(reqId);
          handle.clearDataDefinition(defId);
          reject(new Error('Timeout reading SimVars batch'));
        }
      }, 10000);
    });
  }

  private _handleSimObjectData(recv: RecvSimObjectData): void {
    const reqId = recv.requestID;

    // Handle single-var reads
    const singlePending = this._pendingReads.get(reqId);
    if (singlePending) {
      this._pendingReads.delete(reqId);
      try {
        const value = this._readValueFromBuffer(
          recv.data,
          singlePending.dataType
        );
        singlePending.resolve(value);
      } catch (err) {
        singlePending.reject(
          err instanceof Error ? err : new Error(String(err))
        );
      }
      return;
    }

    // Handle batch reads
    const batchPending = this._pendingBatchReads.get(reqId);
    if (batchPending) {
      this._pendingBatchReads.delete(reqId);
      try {
        const result: Record<string, number | string> = {};
        for (let i = 0; i < batchPending.vars.length; i++) {
          const value = this._readValueFromBuffer(
            recv.data,
            batchPending.dataTypes[i]
          );
          result[batchPending.vars[i].name] = value;
        }
        batchPending.resolve(result);
      } catch (err) {
        batchPending.reject(
          err instanceof Error ? err : new Error(String(err))
        );
      }
    }
  }

  /**
   * Infer the SimConnect data type from the SimVar name/unit/value.
   * String SimVars (like TITLE) use STRING256, booleans use INT32, everything else FLOAT64.
   */
  private _inferDataType(
    name: string,
    unit: string,
    value?: number | string
  ): SimConnectDataType {
    const upperName = name.toUpperCase();

    // String-type SimVars
    if (
      upperName === 'TITLE' ||
      upperName === 'ATC TYPE' ||
      upperName === 'ATC MODEL' ||
      upperName === 'ATC ID' ||
      upperName === 'GPS WP NEXT ID'
    ) {
      return SimConnectDataType.STRING256;
    }

    // If value is a string, use STRING256
    if (typeof value === 'string') {
      return SimConnectDataType.STRING256;
    }

    // Boolean-unit SimVars
    if (unit.toLowerCase() === 'bool' || unit.toLowerCase() === 'boolean') {
      return SimConnectDataType.INT32;
    }

    // Default to FLOAT64 for numeric values
    return SimConnectDataType.FLOAT64;
  }

  private _readValueFromBuffer(
    data: RawBuffer,
    dataType: SimConnectDataType
  ): number | string {
    switch (dataType) {
      case SimConnectDataType.INT32:
        return data.readInt32();
      case SimConnectDataType.INT64:
        return data.readInt64();
      case SimConnectDataType.FLOAT32:
        return data.readFloat32();
      case SimConnectDataType.FLOAT64:
        return data.readFloat64();
      case SimConnectDataType.STRING8:
        return data.readString8();
      case SimConnectDataType.STRING32:
        return data.readString32();
      case SimConnectDataType.STRING64:
        return data.readString64();
      case SimConnectDataType.STRING128:
        return data.readString128();
      case SimConnectDataType.STRING256:
        return data.readString256();
      case SimConnectDataType.STRING260:
        return data.readString260();
      case SimConnectDataType.STRINGV:
        return data.readStringV();
      default:
        return data.readFloat64();
    }
  }

  private _writeValueToBuffer(
    buffer: RawBuffer,
    value: number | string,
    dataType: SimConnectDataType
  ): void {
    if (typeof value === 'string') {
      buffer.writeString256(value);
      return;
    }

    switch (dataType) {
      case SimConnectDataType.INT32:
        buffer.writeInt32(value);
        break;
      case SimConnectDataType.INT64:
        buffer.writeInt64(value);
        break;
      case SimConnectDataType.FLOAT32:
        buffer.writeFloat32(value);
        break;
      case SimConnectDataType.FLOAT64:
        buffer.writeFloat64(value);
        break;
      default:
        buffer.writeFloat64(value);
        break;
    }
  }

  private _allocateDefinitionId(): number {
    return this._nextDefinitionId++;
  }

  private _allocateRequestId(): number {
    return this._nextRequestId++;
  }
}
