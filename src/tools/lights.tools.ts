import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SimConnectService } from '../services/simconnect.service.js';
import { SimVarService } from '../services/simvar.service.js';
import { EventService } from '../services/event.service.js';
import { SafetyService } from '../services/safety.service.js';

/** Light name to SimVar and toggle event mapping */
const LIGHT_MAP: Record<string, { simvar: string; event: string }> = {
  nav: { simvar: 'LIGHT NAV ON', event: 'TOGGLE_NAV_LIGHTS' },
  beacon: { simvar: 'LIGHT BEACON ON', event: 'TOGGLE_BEACON_LIGHTS' },
  landing: { simvar: 'LIGHT LANDING ON', event: 'LANDING_LIGHTS_TOGGLE' },
  taxi: { simvar: 'LIGHT TAXI ON', event: 'TOGGLE_TAXI_LIGHTS' },
  strobe: { simvar: 'LIGHT STROBE ON', event: 'STROBES_TOGGLE' },
  panel: { simvar: 'LIGHT PANEL ON', event: 'PANEL_LIGHTS_TOGGLE' },
  cabin: { simvar: 'LIGHT CABIN ON', event: 'TOGGLE_CABIN_LIGHTS' },
  wing: { simvar: 'LIGHT WING ON', event: 'TOGGLE_WING_LIGHTS' },
  logo: { simvar: 'LIGHT LOGO ON', event: 'TOGGLE_LOGO_LIGHTS' },
  recognition: { simvar: 'LIGHT RECOGNITION ON', event: 'TOGGLE_RECOGNITION_LIGHTS' },
};

const ALL_LIGHT_NAMES = Object.keys(LIGHT_MAP);

export function registerLightsTools(server: McpServer): void {
  const simConnect = SimConnectService.getInstance();
  const simVarService = new SimVarService(simConnect);
  const eventService = new EventService(simConnect);
  const safety = SafetyService.getInstance();

  server.tool(
    'control_lights',
    "Control aircraft lights individually or all at once. For 'on'/'off' actions, the current state is read first and the light is only toggled if needed. For 'all', the action is applied to every light. Returns the current state of all lights after the action. Examples: control_lights({light: 'landing', action: 'on'}), control_lights({light: 'all', action: 'off'}).",
    {
      light: z
        .enum(['nav', 'beacon', 'landing', 'taxi', 'strobe', 'panel', 'cabin', 'wing', 'logo', 'recognition', 'all'])
        .describe("Light to control, or 'all' for every light"),
      action: z
        .enum(['on', 'off', 'toggle'])
        .describe("Action: 'on' (ensure on), 'off' (ensure off), or 'toggle'"),
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

        const safetyCheck = safety.checkAction('control_lights');
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

        const lightsToControl = args.light === 'all' ? ALL_LIGHT_NAMES : [args.light];

        if (args.action === 'toggle') {
          // Toggle: just fire the toggle events
          for (const light of lightsToControl) {
            await eventService.sendEvent(LIGHT_MAP[light].event);
          }
        } else {
          // on/off: read current state first, only toggle if needed
          const stateVars = lightsToControl.map((light) => ({
            name: LIGHT_MAP[light].simvar,
            unit: 'bool',
          }));
          const states = await simVarService.getSimVars(stateVars);

          for (const light of lightsToControl) {
            const currentlyOn = Number(states[LIGHT_MAP[light].simvar]) === 1;
            const wantOn = args.action === 'on';
            if (currentlyOn !== wantOn) {
              await eventService.sendEvent(LIGHT_MAP[light].event);
            }
          }
        }

        // Read final state of all lights
        const allStateVars = ALL_LIGHT_NAMES.map((light) => ({
          name: LIGHT_MAP[light].simvar,
          unit: 'bool',
        }));
        const finalStates = await simVarService.getSimVars(allStateVars);

        const lightStates: Record<string, boolean> = {};
        for (const light of ALL_LIGHT_NAMES) {
          lightStates[light] = Number(finalStates[LIGHT_MAP[light].simvar]) === 1;
        }

        const result: Record<string, unknown> = {
          success: true,
          action: args.action,
          target: args.light,
          lights: lightStates,
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
