import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SimConnectService } from '../services/simconnect.service.js';
import { SimVarService } from '../services/simvar.service.js';
import { EventService } from '../services/event.service.js';
import { SafetyService } from '../services/safety.service.js';

/** Maps set_autopilot actions to SimConnect events */
const AP_ACTION_EVENTS: Record<string, string> = {
  engage: 'AUTOPILOT_ON',
  disengage: 'AUTOPILOT_OFF',
  set_heading: 'HEADING_BUG_SET',
  set_altitude: 'AP_ALT_VAR_SET_ENGLISH',
  set_vs: 'AP_VS_VAR_SET_ENGLISH',
  set_speed: 'AP_SPD_VAR_SET',
  toggle_approach: 'AP_APR_HOLD',
  toggle_nav: 'AP_NAV1_HOLD',
};

/** Actions that require a value parameter */
const VALUE_REQUIRED_ACTIONS = new Set([
  'set_heading',
  'set_altitude',
  'set_vs',
  'set_speed',
]);

/** Validation ranges per action */
const VALUE_RANGES: Record<string, { min: number; max: number; label: string }> = {
  set_heading: { min: 0, max: 360, label: 'Heading (degrees)' },
  set_altitude: { min: 0, max: 60000, label: 'Altitude (feet)' },
  set_vs: { min: -8000, max: 8000, label: 'Vertical speed (fpm)' },
  set_speed: { min: 0, max: 500, label: 'Speed (knots)' },
};

export function registerAutopilotTools(server: McpServer): void {
  const simConnect = SimConnectService.getInstance();
  const simVarService = new SimVarService(simConnect);
  const eventService = new EventService(simConnect);
  const safety = SafetyService.getInstance();

  server.tool(
    'get_autopilot_state',
    "Read the full autopilot state including master status, heading bug, target altitude, vertical speed, speed hold, approach/NAV hold, flight director, and yaw damper. Returns all autopilot parameters in a single call.",
    {},
    async () => {
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

        const vars = [
          { name: 'AUTOPILOT MASTER', unit: 'bool' },
          { name: 'AUTOPILOT HEADING LOCK DIR', unit: 'degrees' },
          { name: 'AUTOPILOT ALTITUDE LOCK VAR', unit: 'feet' },
          { name: 'AUTOPILOT VERTICAL HOLD VAR', unit: 'feet per minute' },
          { name: 'AUTOPILOT AIRSPEED HOLD VAR', unit: 'knots' },
          { name: 'AUTOPILOT APPROACH HOLD', unit: 'bool' },
          { name: 'AUTOPILOT NAV1 LOCK', unit: 'bool' },
          { name: 'AUTOPILOT FLIGHT DIRECTOR ACTIVE', unit: 'bool' },
          { name: 'AUTOPILOT YAW DAMPER', unit: 'bool' },
        ];

        const values = await simVarService.getSimVars(vars);

        const state = {
          master_on: values['AUTOPILOT MASTER'] === 1,
          heading_bug_deg: values['AUTOPILOT HEADING LOCK DIR'],
          target_altitude_ft: values['AUTOPILOT ALTITUDE LOCK VAR'],
          target_vs_fpm: values['AUTOPILOT VERTICAL HOLD VAR'],
          speed_hold_kts: values['AUTOPILOT AIRSPEED HOLD VAR'],
          approach_hold: values['AUTOPILOT APPROACH HOLD'] === 1,
          nav_hold: values['AUTOPILOT NAV1 LOCK'] === 1,
          flight_director_on: values['AUTOPILOT FLIGHT DIRECTOR ACTIVE'] === 1,
          yaw_damper_on: values['AUTOPILOT YAW DAMPER'] === 1,
        };

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(state, null, 2),
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
    'set_autopilot',
    "Control autopilot modes and settings. Actions: 'engage' (turn AP on), 'disengage' (turn AP off), 'set_heading' (set heading bug, value 0-360), 'set_altitude' (set target alt, value 0-60000 ft), 'set_vs' (set vertical speed, value -8000 to 8000 fpm), 'set_speed' (set speed hold, value 0-500 kts), 'toggle_approach' (toggle approach hold), 'toggle_nav' (toggle NAV1 hold). Examples: set_autopilot({action: 'engage'}), set_autopilot({action: 'set_heading', value: 270}), set_autopilot({action: 'set_altitude', value: 35000}).",
    {
      action: z
        .enum([
          'engage',
          'disengage',
          'set_heading',
          'set_altitude',
          'set_vs',
          'set_speed',
          'toggle_approach',
          'toggle_nav',
        ])
        .describe("Autopilot action to perform"),
      value: z
        .number()
        .optional()
        .describe("Value for set_heading (0-360), set_altitude (0-60000), set_vs (-8000 to 8000), or set_speed (0-500)"),
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

        // Safety check
        const safetyCheck = safety.checkAction('set_autopilot');
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

        // Validate value is provided for actions that need it
        if (VALUE_REQUIRED_ACTIONS.has(args.action) && args.value === undefined) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  { error: `Action '${args.action}' requires a 'value' parameter.` },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }

        // Validate value ranges
        const range = VALUE_RANGES[args.action];
        if (range && args.value !== undefined) {
          if (args.value < range.min || args.value > range.max) {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify(
                    {
                      error: `${range.label} must be between ${range.min} and ${range.max}. Got: ${args.value}`,
                    },
                    null,
                    2
                  ),
                },
              ],
              isError: true,
            };
          }
        }

        const eventName = AP_ACTION_EVENTS[args.action];
        await eventService.sendEvent(eventName, args.value);

        const result: Record<string, unknown> = {
          success: true,
          action: args.action,
        };

        if (args.value !== undefined) {
          result['value'] = args.value;
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
