import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WASimService } from '../services/wasim.service.js';
import { SafetyService } from '../services/safety.service.js';

export function registerWASimTools(server: McpServer): void {
  const wasim = WASimService.getInstance();
  const safety = SafetyService.getInstance();

  server.tool(
    'get_lvar',
    "Read an L: (local) variable value. L:vars are aircraft-specific variables used by complex add-on aircraft like PMDG, FlyByWire A32NX, Fenix, etc. for internal cockpit state. Examples: get_lvar({name: 'XMLVAR_Baro1_Mode'}), get_lvar({name: 'A32NX_EFIS_L_OPTION'}). Requires WASimCommander WASM module installed in MSFS.",
    {
      name: z
        .string()
        .describe("L:var name to read, e.g. 'XMLVAR_Baro1_Mode', 'A32NX_EFIS_L_OPTION'"),
    },
    async (args) => {
      try {
        if (!wasim.isAvailable) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  {
                    error:
                      'WASimCommander is not available. The WASM module may not be installed in MSFS, or no compatible Node.js client library is present.',
                  },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }

        const value = await wasim.getLvar(args.name);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                { name: args.name, value },
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
    'set_lvar',
    "Write an L: (local) variable value. L:vars are aircraft-specific variables used by complex add-on aircraft like PMDG, FlyByWire A32NX, Fenix, etc. Use this to interact with cockpit switches, knobs, and systems not exposed through standard SimConnect. Examples: set_lvar({name: 'XMLVAR_Baro1_Mode', value: 1}), set_lvar({name: 'A32NX_OVHD_ELEC_BAT_1_PB_IS_AUTO', value: 1}). Requires WASimCommander WASM module. This is a powerful operation — use with care.",
    {
      name: z
        .string()
        .describe("L:var name to write, e.g. 'XMLVAR_Baro1_Mode'"),
      value: z
        .number()
        .describe('Numeric value to set the L:var to'),
    },
    async (args) => {
      try {
        if (!wasim.isAvailable) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  {
                    error:
                      'WASimCommander is not available. The WASM module may not be installed in MSFS, or no compatible Node.js client library is present.',
                  },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }

        const safetyCheck = safety.checkAction('set_lvar', {
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

        await wasim.setLvar(args.name, args.value);

        const result: Record<string, unknown> = {
          success: true,
          name: args.name,
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

  server.tool(
    'trigger_h_event',
    "Trigger an H: (HTML/gauge) event. H:events are used by complex add-on aircraft for cockpit interactions not exposed through standard SimConnect Key Events. Common in PMDG, FlyByWire A32NX, Fenix aircraft. Examples: trigger_h_event({name: 'A32NX_EFIS_L_CHRONO_PUSHED'}), trigger_h_event({name: 'B787_MFD_NAV_Switch'}). Requires WASimCommander WASM module installed in MSFS.",
    {
      name: z
        .string()
        .describe("H:event name to trigger, e.g. 'A32NX_EFIS_L_CHRONO_PUSHED'"),
    },
    async (args) => {
      try {
        if (!wasim.isAvailable) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  {
                    error:
                      'WASimCommander is not available. The WASM module may not be installed in MSFS, or no compatible Node.js client library is present.',
                  },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }

        const safetyCheck = safety.checkAction('trigger_h_event', {
          name: args.name,
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

        await wasim.triggerHEvent(args.name);

        const result: Record<string, unknown> = {
          success: true,
          event_name: args.name,
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

  server.tool(
    'execute_calculator_code',
    "Execute RPN (Reverse Polish Notation) calculator code in MSFS. Calculator code is the most powerful interface to MSFS internals, allowing reading/writing of any variable type (A:, L:, K:, etc.) and complex operations. Examples: execute_calculator_code({code: '(A:PLANE ALTITUDE,feet)'}), execute_calculator_code({code: '(L:XMLVAR_Baro1_Mode) 1 + (>L:XMLVAR_Baro1_Mode)'}). Requires WASimCommander WASM module. This is the most powerful operation available — use with extreme care.",
    {
      code: z
        .string()
        .describe("RPN calculator code to execute, e.g. '(A:PLANE ALTITUDE,feet)', '(L:XMLVAR_Baro1_Mode) 1 + (>L:XMLVAR_Baro1_Mode)'"),
    },
    async (args) => {
      try {
        if (!wasim.isAvailable) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  {
                    error:
                      'WASimCommander is not available. The WASM module may not be installed in MSFS, or no compatible Node.js client library is present.',
                  },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }

        const safetyCheck = safety.checkAction('execute_calculator_code', {
          code: args.code,
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

        const result_value = await wasim.executeCalcCode(args.code);

        const result: Record<string, unknown> = {
          success: true,
          code: args.code,
          result: result_value,
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
