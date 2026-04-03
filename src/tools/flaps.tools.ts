import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SimConnectService } from '../services/simconnect.service.js';
import { SimVarService } from '../services/simvar.service.js';
import { EventService } from '../services/event.service.js';
import { SafetyService } from '../services/safety.service.js';

/** Maps position_pct (0-100) to SimConnect flaps range (0-16383) */
function pctToSimConnect(pct: number): number {
  return Math.round((pct / 100) * 16383);
}

export function registerFlapsTools(server: McpServer): void {
  const simConnect = SimConnectService.getInstance();
  const simVarService = new SimVarService(simConnect);
  const eventService = new EventService(simConnect);
  const safety = SafetyService.getInstance();

  server.tool(
    'control_flaps',
    "Control the aircraft flaps. Actions: 'increase' (one notch down), 'decrease' (one notch up), or 'set' (to a specific position percentage). For 'set', provide position_pct (0=retracted, 100=fully extended). Returns current flap handle position and number of flap notches. Examples: control_flaps({action: 'increase'}), control_flaps({action: 'set', position_pct: 50}).",
    {
      action: z
        .enum(['increase', 'decrease', 'set'])
        .describe("Flap action: 'increase' (extend one notch), 'decrease' (retract one notch), or 'set' (to position_pct)"),
      position_pct: z
        .number()
        .min(0)
        .max(100)
        .optional()
        .describe("Flap position percentage (0-100). Required when action is 'set'."),
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

        const safetyCheck = safety.checkAction('control_flaps');
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

        // Validate position_pct is provided for 'set' action
        if (args.action === 'set' && args.position_pct === undefined) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  { error: "position_pct is required when action is 'set'" },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }

        // Execute flap action
        if (args.action === 'increase') {
          await eventService.sendEvent('FLAPS_INCR');
        } else if (args.action === 'decrease') {
          await eventService.sendEvent('FLAPS_DECR');
        } else {
          const simValue = pctToSimConnect(args.position_pct!);
          await eventService.sendEvent('FLAPS_SET', simValue);
        }

        // Read current flap state after action
        const stateVars = [
          { name: 'FLAPS HANDLE PERCENT', unit: 'percent over 100' },
          { name: 'FLAPS NUM HANDLE POSITIONS', unit: 'number' },
        ];
        const state = await simVarService.getSimVars(stateVars);

        const handlePercent = Number(state['FLAPS HANDLE PERCENT']);
        const numPositions = Number(state['FLAPS NUM HANDLE POSITIONS']);

        const result: Record<string, unknown> = {
          success: true,
          action: args.action,
          flap_handle_pct: Math.round(handlePercent * 100 * 10) / 10,
          flap_num_positions: numPositions,
        };

        if (args.action === 'set') {
          result['requested_pct'] = args.position_pct;
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
}
