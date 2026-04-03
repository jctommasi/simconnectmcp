import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SimConnectService } from '../services/simconnect.service.js';
import { SimVarService } from '../services/simvar.service.js';
import { EventService } from '../services/event.service.js';
import { SafetyService } from '../services/safety.service.js';

/** Maps value_pct (0-100) to SimConnect event range (0-16383) */
function pctToSimConnect(pct: number): number {
  return Math.round((pct / 100) * 16383);
}

/** Per-engine indexed event names for each controllable parameter */
const ENGINE_EVENTS: Record<string, { all: string; indexed: string[] }> = {
  throttle: {
    all: 'THROTTLE_SET',
    indexed: ['THROTTLE1_SET', 'THROTTLE2_SET', 'THROTTLE3_SET', 'THROTTLE4_SET'],
  },
  mixture: {
    all: 'MIXTURE_SET',
    indexed: ['MIXTURE1_SET', 'MIXTURE2_SET', 'MIXTURE3_SET', 'MIXTURE4_SET'],
  },
  prop_pitch: {
    all: 'PROP_PITCH_SET',
    indexed: ['PROP_PITCH1_SET', 'PROP_PITCH2_SET', 'PROP_PITCH3_SET', 'PROP_PITCH4_SET'],
  },
};

export function registerEngineTools(server: McpServer): void {
  const simConnect = SimConnectService.getInstance();
  const simVarService = new SimVarService(simConnect);
  const eventService = new EventService(simConnect);
  const safety = SafetyService.getInstance();

  server.tool(
    'get_engine_data',
    "Read engine parameters for all engines on the aircraft. Auto-detects the number of engines (1-4). Returns per-engine data including RPM, N1/N2 percentages, EGT (rankine), fuel flow (GPH), oil temperature (rankine), oil pressure (PSF), throttle position (%), mixture position (%), and propeller RPM.",
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

        // Detect number of engines
        const numEngines = await simVarService.getSimVar('NUMBER OF ENGINES', 'number');
        const engineCount = Math.min(Math.max(Number(numEngines), 1), 4);

        // Build batch read for all engine SimVars
        const perEngineVars = [
          { name: 'GENERAL ENG RPM', unit: 'rpm' },
          { name: 'TURB ENG N1', unit: 'percent' },
          { name: 'TURB ENG N2', unit: 'percent' },
          { name: 'ENG EXHAUST GAS TEMPERATURE', unit: 'rankine' },
          { name: 'ENG FUEL FLOW GPH', unit: 'gallons per hour' },
          { name: 'ENG OIL TEMPERATURE', unit: 'rankine' },
          { name: 'ENG OIL PRESSURE', unit: 'psf' },
          { name: 'GENERAL ENG THROTTLE LEVER POSITION', unit: 'percent' },
          { name: 'GENERAL ENG MIXTURE LEVER POSITION', unit: 'percent' },
          { name: 'PROP RPM', unit: 'rpm' },
        ];

        const vars: Array<{ name: string; unit: string }> = [];
        for (let eng = 1; eng <= engineCount; eng++) {
          for (const v of perEngineVars) {
            vars.push({ name: `${v.name}:${eng}`, unit: v.unit });
          }
        }

        const values = await simVarService.getSimVars(vars);

        const engines: Array<Record<string, number | string>> = [];
        for (let eng = 1; eng <= engineCount; eng++) {
          engines.push({
            engine: eng,
            rpm: values[`GENERAL ENG RPM:${eng}`],
            n1_pct: values[`TURB ENG N1:${eng}`],
            n2_pct: values[`TURB ENG N2:${eng}`],
            egt_rankine: values[`ENG EXHAUST GAS TEMPERATURE:${eng}`],
            fuel_flow_gph: values[`ENG FUEL FLOW GPH:${eng}`],
            oil_temp_rankine: values[`ENG OIL TEMPERATURE:${eng}`],
            oil_pressure_psf: values[`ENG OIL PRESSURE:${eng}`],
            throttle_pct: values[`GENERAL ENG THROTTLE LEVER POSITION:${eng}`],
            mixture_pct: values[`GENERAL ENG MIXTURE LEVER POSITION:${eng}`],
            prop_rpm: values[`PROP RPM:${eng}`],
          });
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ number_of_engines: engineCount, engines }, null, 2),
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
    'control_engine',
    "Control engine throttle, mixture, or propeller pitch. Maps value_pct (0-100) to the SimConnect range (0-16383) internally. Use engine 'all' to set all engines at once, or specify engine 1-4. Examples: control_engine({engine: 'all', parameter: 'throttle', value_pct: 75}), control_engine({engine: 1, parameter: 'mixture', value_pct: 100}).",
    {
      engine: z
        .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal('all')])
        .describe("Engine number (1-4) or 'all' for all engines"),
      parameter: z
        .enum(['throttle', 'mixture', 'prop_pitch'])
        .describe("Engine parameter to control: 'throttle', 'mixture', or 'prop_pitch'"),
      value_pct: z
        .number()
        .min(0)
        .max(100)
        .describe('Value as percentage (0-100)'),
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

        const safetyCheck = safety.checkAction('control_engine', {
          parameter: args.parameter,
          value_pct: args.value_pct,
        });

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

        const simValue = pctToSimConnect(args.value_pct);
        const eventMap = ENGINE_EVENTS[args.parameter];

        if (args.engine === 'all') {
          await eventService.sendEvent(eventMap.all, simValue);
        } else {
          const eventName = eventMap.indexed[args.engine - 1];
          await eventService.sendEvent(eventName, simValue);
        }

        const result: Record<string, unknown> = {
          success: true,
          engine: args.engine,
          parameter: args.parameter,
          value_pct: args.value_pct,
          simconnect_value: simValue,
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
