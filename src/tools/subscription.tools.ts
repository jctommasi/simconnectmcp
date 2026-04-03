import { z } from 'zod';
import {
  SimConnectConstants,
  SimConnectDataType,
  SimConnectPeriod,
} from 'node-simconnect';
import type { RecvSimObjectData } from 'node-simconnect';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SimConnectService } from '../services/simconnect.service.js';
import { SimVarService } from '../services/simvar.service.js';
import { config } from '../config.js';
import { Logger } from '../logger.js';

interface Subscription {
  id: string;
  names: string[];
  unit: string;
  interval_ms: number;
  definitionId: number;
  requestId: number;
  dataTypes: SimConnectDataType[];
}

/** Monotonically increasing IDs for subscription definitions/requests (range 3000+) */
let nextSubDefinitionId = 3000;
let nextSubRequestId = 3000;
let subscriptionCounter = 0;

/** Active subscriptions keyed by subscription_id */
const activeSubscriptions = new Map<string, Subscription>();

/** Map requestId to subscription for data handler */
const requestToSubscription = new Map<number, Subscription>();

/** Returns the number of currently active SimVar subscriptions. */
export function getActiveSubscriptionCount(): number {
  return activeSubscriptions.size;
}

export function registerSubscriptionTools(server: McpServer): void {
  const simConnect = SimConnectService.getInstance();
  const simVarService = new SimVarService(simConnect);
  const logger = new Logger(config.logLevel);

  let listenerAttached = false;

  function ensureSubscriptionListener(): void {
    if (listenerAttached) return;
    const handle = simConnect.getSimConnectInstance();
    if (!handle) return;

    handle.on('simObjectData', (recv: RecvSimObjectData) => {
      const sub = requestToSubscription.get(recv.requestID);
      if (!sub) return;

      try {
        for (let i = 0; i < sub.names.length; i++) {
          const value = readValue(recv.data, sub.dataTypes[i]);
          simVarService.setCachedValue(sub.names[i], sub.unit, value);
        }
      } catch (err) {
        logger.error(
          `Error processing subscription ${sub.id} data`,
          err
        );
      }
    });

    listenerAttached = true;
  }

  function readValue(
    data: import('node-simconnect').RawBuffer,
    dataType: SimConnectDataType
  ): number | string {
    switch (dataType) {
      case SimConnectDataType.INT32:
        return data.readInt32();
      case SimConnectDataType.FLOAT64:
        return data.readFloat64();
      case SimConnectDataType.STRING256:
        return data.readString256();
      default:
        return data.readFloat64();
    }
  }

  function inferDataType(name: string, unit: string): SimConnectDataType {
    const upperName = name.toUpperCase();
    if (
      upperName === 'TITLE' ||
      upperName === 'ATC TYPE' ||
      upperName === 'ATC MODEL' ||
      upperName === 'ATC ID' ||
      upperName === 'GPS WP NEXT ID'
    ) {
      return SimConnectDataType.STRING256;
    }
    if (unit.toLowerCase() === 'bool' || unit.toLowerCase() === 'boolean') {
      return SimConnectDataType.INT32;
    }
    return SimConnectDataType.FLOAT64;
  }

  function intervalToPeriod(intervalMs: number): SimConnectPeriod {
    // SimConnect provides discrete periods; map interval to the closest
    if (intervalMs <= 0) return SimConnectPeriod.SIM_FRAME;
    if (intervalMs <= 50) return SimConnectPeriod.SIM_FRAME;
    if (intervalMs <= 1000) return SimConnectPeriod.SECOND;
    return SimConnectPeriod.SECOND;
  }

  server.tool(
    'subscribe_simvar',
    "Subscribe to one or more SimVars for continuous monitoring. Subscribed values are cached and returned instantly by get_simvar without re-requesting from the simulator. Default interval is 1 second. Example: subscribe_simvar({names: ['PLANE ALTITUDE', 'AIRSPEED INDICATED'], unit: 'feet'}). Max simultaneous subscriptions: " +
      config.maxSubscriptions +
      '.',
    {
      names: z
        .array(z.string())
        .min(1)
        .describe(
          "Array of SimVar names to subscribe to, e.g. ['PLANE ALTITUDE', 'AIRSPEED INDICATED']"
        ),
      unit: z
        .string()
        .describe(
          "Unit for the SimVars, e.g. 'feet', 'knots', 'degrees', 'bool'"
        ),
      interval_ms: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe(
          'Update interval in milliseconds (default 1000). Values <= 50 use per-frame updates.'
        ),
    },
    async (args) => {
      try {
        if (!simConnect.isConnected) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  {
                    error:
                      'Not connected to SimConnect. Use simconnect_connect first.',
                  },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }

        // Check max subscriptions
        if (activeSubscriptions.size >= config.maxSubscriptions) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  {
                    error: `Maximum subscriptions limit reached (${config.maxSubscriptions}). Unsubscribe from existing subscriptions first.`,
                  },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }

        ensureSubscriptionListener();

        const handle = simConnect.getSimConnectInstance()!;
        const intervalMs = args.interval_ms ?? 1000;
        const defId = nextSubDefinitionId++;
        const reqId = nextSubRequestId++;
        const dataTypes: SimConnectDataType[] = [];

        // Register all SimVars in a single data definition
        for (const name of args.names) {
          const dt = inferDataType(name, args.unit);
          dataTypes.push(dt);
          handle.addToDataDefinition(defId, name, args.unit, dt);
        }

        // Request periodic data
        const period = intervalToPeriod(intervalMs);
        handle.requestDataOnSimObject(
          reqId,
          defId,
          SimConnectConstants.OBJECT_ID_USER,
          period
        );

        const subscriptionId = `sub_${++subscriptionCounter}`;
        const subscription: Subscription = {
          id: subscriptionId,
          names: args.names,
          unit: args.unit,
          interval_ms: intervalMs,
          definitionId: defId,
          requestId: reqId,
          dataTypes,
        };

        activeSubscriptions.set(subscriptionId, subscription);
        requestToSubscription.set(reqId, subscription);

        logger.info(
          `Created subscription ${subscriptionId} for ${args.names.join(', ')} (${args.unit}) at ${intervalMs}ms`
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  subscription_id: subscriptionId,
                  names: args.names,
                  unit: args.unit,
                  interval_ms: intervalMs,
                  active_subscriptions: activeSubscriptions.size,
                  max_subscriptions: config.maxSubscriptions,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ error: message }, null, 2),
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'unsubscribe_simvar',
    'Cancel an active SimVar subscription by its subscription_id. The cached values for the unsubscribed SimVars will be removed.',
    {
      subscription_id: z
        .string()
        .describe(
          "The subscription ID returned by subscribe_simvar, e.g. 'sub_1'"
        ),
    },
    async (args) => {
      try {
        if (!simConnect.isConnected) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  {
                    error:
                      'Not connected to SimConnect. Use simconnect_connect first.',
                  },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }

        const subscription = activeSubscriptions.get(args.subscription_id);
        if (!subscription) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  {
                    error: `Subscription '${args.subscription_id}' not found. Use subscribe_simvar to create a subscription first.`,
                    active_subscriptions: Array.from(
                      activeSubscriptions.keys()
                    ),
                  },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }

        const handle = simConnect.getSimConnectInstance()!;

        // Stop the periodic request by setting period to NEVER
        handle.requestDataOnSimObject(
          subscription.requestId,
          subscription.definitionId,
          SimConnectConstants.OBJECT_ID_USER,
          SimConnectPeriod.NEVER
        );

        // Clear the data definition
        handle.clearDataDefinition(subscription.definitionId);

        // Remove cached values
        for (const name of subscription.names) {
          simVarService.removeCachedValue(name, subscription.unit);
        }

        // Clean up maps
        requestToSubscription.delete(subscription.requestId);
        activeSubscriptions.delete(args.subscription_id);

        logger.info(
          `Cancelled subscription ${args.subscription_id} for ${subscription.names.join(', ')}`
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  unsubscribed: true,
                  subscription_id: args.subscription_id,
                  removed_vars: subscription.names,
                  active_subscriptions: activeSubscriptions.size,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ error: message }, null, 2),
            },
          ],
          isError: true,
        };
      }
    }
  );
}
