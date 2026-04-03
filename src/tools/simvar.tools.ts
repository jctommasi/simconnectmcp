import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SimConnectService } from '../services/simconnect.service.js';
import { SimVarService } from '../services/simvar.service.js';
import { SafetyService } from '../services/safety.service.js';

export function registerSimVarTools(server: McpServer): void {
  const simConnect = SimConnectService.getInstance();
  const simVarService = new SimVarService(simConnect);
  const safety = SafetyService.getInstance();

  server.tool(
    'get_simvar',
    "Read one or more SimVar values from the simulator. Examples: get_simvar({names: 'PLANE ALTITUDE', unit: 'feet'}), get_simvar({names: ['PLANE LATITUDE', 'PLANE LONGITUDE'], unit: 'degrees'}). Common SimVars: 'PLANE ALTITUDE' (feet), 'AIRSPEED INDICATED' (knots), 'HEADING INDICATOR' (degrees), 'VERTICAL SPEED' (feet per minute), 'GENERAL ENG RPM:1' (rpm), 'FUEL TOTAL QUANTITY' (gallons).",
    {
      names: z
        .union([z.string(), z.array(z.string())])
        .describe('SimVar name or array of SimVar names to read'),
      unit: z
        .string()
        .describe(
          "Unit for the SimVar(s), e.g. 'feet', 'knots', 'degrees', 'bool', 'percent'"
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

        const nameList = Array.isArray(args.names)
          ? args.names
          : [args.names];

        if (nameList.length === 1) {
          const value = await simVarService.getSimVar(
            nameList[0],
            args.unit
          );
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  { [nameList[0]]: value },
                  null,
                  2
                ),
              },
            ],
          };
        }

        const vars = nameList.map((name) => ({
          name,
          unit: args.unit,
        }));
        const values = await simVarService.getSimVars(vars);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(values, null, 2),
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
    'set_simvar',
    "Write a SimVar value to the simulator. Example: set_simvar({name: 'HEADING INDICATOR', unit: 'degrees', value: 270}). Common writable SimVars: 'GENERAL ENG THROTTLE LEVER POSITION:1' (percent), 'AUTOPILOT HEADING LOCK DIR' (degrees), 'KOHLSMAN SETTING MB' (millibars). Note: many SimVars are read-only; use send_event for actions like toggling switches.",
    {
      name: z
        .string()
        .describe("SimVar name to write, e.g. 'HEADING INDICATOR'"),
      unit: z
        .string()
        .describe("Unit for the SimVar, e.g. 'degrees', 'percent'"),
      value: z
        .number()
        .describe('Numeric value to set'),
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

        const safetyCheck = safety.checkAction('set_simvar', {
          name: args.name,
          value: args.value,
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

        await simVarService.setSimVar(args.name, args.unit, args.value);

        const result: Record<string, unknown> = {
          success: true,
          name: args.name,
          unit: args.unit,
          value: args.value,
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
