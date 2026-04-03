import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SimConnectService } from '../services/simconnect.service.js';
import { SimVarService } from '../services/simvar.service.js';
import { EventService } from '../services/event.service.js';
import { SafetyService } from '../services/safety.service.js';

/** Valid sim rates in MSFS (powers of 2 from 0.25 to 128) */
const VALID_SIM_RATES = [0.25, 0.5, 1, 2, 4, 8, 16, 32, 64, 128];

export function registerSimulationTools(server: McpServer): void {
  const simConnect = SimConnectService.getInstance();
  const simVarService = new SimVarService(simConnect);
  const eventService = new EventService(simConnect);
  const safety = SafetyService.getInstance();

  server.tool(
    'control_sim_rate',
    "Control the simulation speed/rate. Actions: 'increase' (double rate), 'decrease' (halve rate), 'set' (set to a specific target rate). For 'set', provide target_rate (valid values: 0.25, 0.5, 1, 2, 4, 8, 16, 32, 64, 128). The tool sends multiple SIM_RATE_INCR/DECR events to reach the target from the current rate. Returns the current sim rate after the action. Examples: control_sim_rate({action: 'increase'}), control_sim_rate({action: 'set', target_rate: 4}).",
    {
      action: z
        .enum(['increase', 'decrease', 'set'])
        .describe("Action: 'increase' (double), 'decrease' (halve), or 'set' (target specific rate)"),
      target_rate: z
        .number()
        .optional()
        .describe("Target sim rate for 'set' action (valid: 0.25, 0.5, 1, 2, 4, 8, 16, 32, 64, 128)"),
    },
    async (args) => {
      try {
        if (!simConnect.isConnected) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  { error: 'Not connected to SimConnect. Use simconnect_connect first.' },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }

        const safetyCheck = safety.checkAction('control_sim_rate');
        if (!safetyCheck.allowed) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({ error: safetyCheck.reason }, null, 2),
              },
            ],
            isError: true,
          };
        }

        if (args.action === 'set' && args.target_rate === undefined) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  { error: "target_rate is required when action is 'set'" },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }

        if (args.action === 'set' && !VALID_SIM_RATES.includes(args.target_rate!)) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  {
                    error: `Invalid target_rate ${args.target_rate}. Valid rates: ${VALID_SIM_RATES.join(', ')}`,
                  },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }

        if (args.action === 'increase') {
          await eventService.sendEvent('SIM_RATE_INCR');
        } else if (args.action === 'decrease') {
          await eventService.sendEvent('SIM_RATE_DECR');
        } else {
          // 'set' action: read current rate and step to target
          const currentRate = Number(await simVarService.getSimVar('SIMULATION RATE', 'number'));
          const targetRate = args.target_rate!;

          if (targetRate > currentRate) {
            // Need to increase: each INCR doubles the rate
            let rate = currentRate;
            while (rate < targetRate) {
              await eventService.sendEvent('SIM_RATE_INCR');
              rate *= 2;
            }
          } else if (targetRate < currentRate) {
            // Need to decrease: each DECR halves the rate
            let rate = currentRate;
            while (rate > targetRate) {
              await eventService.sendEvent('SIM_RATE_DECR');
              rate /= 2;
            }
          }
        }

        // Read current sim rate after action
        const simRate = Number(await simVarService.getSimVar('SIMULATION RATE', 'number'));

        const result: Record<string, unknown> = {
          success: true,
          action: args.action,
          sim_rate: simRate,
        };

        if (args.target_rate !== undefined) {
          result['target_rate'] = args.target_rate;
        }

        if (safetyCheck.warning) {
          result['warning'] = safetyCheck.warning;
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(result, null, 2),
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
    'pause_sim',
    "Pause or unpause the flight simulator. Actions: 'pause' (pause the sim), 'unpause' (resume the sim), 'toggle' (switch pause state). Returns the current pause state after the action. Examples: pause_sim({action: 'pause'}), pause_sim({action: 'toggle'}).",
    {
      action: z
        .enum(['pause', 'unpause', 'toggle'])
        .describe("Action: 'pause', 'unpause', or 'toggle'"),
    },
    async (args) => {
      try {
        if (!simConnect.isConnected) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  { error: 'Not connected to SimConnect. Use simconnect_connect first.' },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }

        const safetyCheck = safety.checkAction('pause_sim');
        if (!safetyCheck.allowed) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({ error: safetyCheck.reason }, null, 2),
              },
            ],
            isError: true,
          };
        }

        const EVENT_MAP: Record<string, string> = {
          pause: 'PAUSE_ON',
          unpause: 'PAUSE_OFF',
          toggle: 'PAUSE_TOGGLE',
        };

        await eventService.sendEvent(EVENT_MAP[args.action]);

        // Read current pause state after action
        const isPaused = Number(await simVarService.getSimVar('SIM DISABLED', 'bool')) === 1;

        const result: Record<string, unknown> = {
          success: true,
          action: args.action,
          is_paused: isPaused,
        };

        if (safetyCheck.warning) {
          result['warning'] = safetyCheck.warning;
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(result, null, 2),
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
