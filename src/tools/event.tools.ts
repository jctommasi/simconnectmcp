import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SimConnectService } from '../services/simconnect.service.js';
import { EventService } from '../services/event.service.js';
import { SafetyService } from '../services/safety.service.js';

export function registerEventTools(server: McpServer): void {
  const simConnect = SimConnectService.getInstance();
  const eventService = new EventService(simConnect);
  const safety = SafetyService.getInstance();

  server.tool(
    'send_event',
    "Fire a Key Event in the simulator. Examples: send_event({event_name: 'PARKING_BRAKES'}), send_event({event_name: 'HEADING_BUG_SET', value: 270}), send_event({event_name: 'THROTTLE_SET', value: 8192}). Common events: 'AUTOPILOT_ON'/'AUTOPILOT_OFF', 'GEAR_TOGGLE', 'FLAPS_INCR'/'FLAPS_DECR', 'PAUSE_TOGGLE', 'THROTTLE_SET' (0-16383), 'MIXTURE_SET' (0-16383), 'HEADING_BUG_SET' (degrees), 'AP_ALT_VAR_SET_ENGLISH' (feet), 'TOGGLE_NAV_LIGHTS', 'ENGINE_AUTO_START'.",
    {
      event_name: z
        .string()
        .describe("Key Event name to fire, e.g. 'PARKING_BRAKES', 'GEAR_TOGGLE', 'THROTTLE_SET'"),
      value: z
        .number()
        .optional()
        .describe('Optional numeric parameter for the event (e.g., 16383 for THROTTLE_SET, 270 for HEADING_BUG_SET)'),
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

        const safetyCheck = safety.checkAction('send_event', {
          event_name: args.event_name,
        });

        if (!safetyCheck.allowed) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  { error: safetyCheck.reason },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }

        await eventService.sendEvent(args.event_name, args.value);

        const result: Record<string, unknown> = {
          success: true,
          event_name: args.event_name,
          value: args.value ?? 0,
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
