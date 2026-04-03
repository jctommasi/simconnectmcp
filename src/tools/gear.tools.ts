import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SimConnectService } from '../services/simconnect.service.js';
import { SimVarService } from '../services/simvar.service.js';
import { EventService } from '../services/event.service.js';
import { SafetyService } from '../services/safety.service.js';

/** Gear action to SimConnect event mapping */
const GEAR_EVENTS: Record<string, string> = {
  up: 'GEAR_UP',
  down: 'GEAR_DOWN',
  toggle: 'GEAR_TOGGLE',
};

export function registerGearTools(server: McpServer): void {
  const simConnect = SimConnectService.getInstance();
  const simVarService = new SimVarService(simConnect);
  const eventService = new EventService(simConnect);
  const safety = SafetyService.getInstance();

  server.tool(
    'control_landing_gear',
    "Control the landing gear and parking brake. Gear actions: 'up' (retract), 'down' (extend), 'toggle'. Parking brake: 'on', 'off', or 'toggle' (optional). Returns the current state of gear position, gear handle, on-ground status, and parking brake after the action. A warning is issued in safe mode if retracting gear while on the ground. Examples: control_landing_gear({action: 'down'}), control_landing_gear({action: 'toggle', parking_brake: 'toggle'}).",
    {
      action: z
        .enum(['up', 'down', 'toggle'])
        .describe("Gear action: 'up' (retract), 'down' (extend), or 'toggle'"),
      parking_brake: z
        .enum(['on', 'off', 'toggle'])
        .optional()
        .describe("Optional parking brake action: 'on', 'off', or 'toggle'"),
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

        const safetyCheck = safety.checkAction('control_landing_gear', {
          gear_action: args.action,
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

        const warnings: string[] = [];
        if (safetyCheck.warning) {
          warnings.push(safetyCheck.warning);
        }

        // Check for gear retraction on ground in safe mode
        if (args.action === 'up' && safety.getProfile() === 'safe') {
          const onGround = await simVarService.getSimVar('SIM ON GROUND', 'bool');
          if (Number(onGround) === 1) {
            warnings.push('WARNING: Retracting landing gear while on the ground! This could damage the aircraft.');
          }
        }

        // Execute gear action
        await eventService.sendEvent(GEAR_EVENTS[args.action]);

        // Execute parking brake action if specified
        if (args.parking_brake) {
          if (args.parking_brake === 'toggle') {
            await eventService.sendEvent('PARKING_BRAKES');
          } else {
            // Read current state and only toggle if needed
            const currentBrake = await simVarService.getSimVar('BRAKE PARKING POSITION', 'bool');
            const brakeOn = Number(currentBrake) === 1;
            const wantOn = args.parking_brake === 'on';
            if (brakeOn !== wantOn) {
              await eventService.sendEvent('PARKING_BRAKES');
            }
          }
        }

        // Read current state after actions
        const stateVars = [
          { name: 'GEAR TOTAL PCT EXTENDED', unit: 'percent' },
          { name: 'GEAR HANDLE POSITION', unit: 'bool' },
          { name: 'SIM ON GROUND', unit: 'bool' },
          { name: 'BRAKE PARKING POSITION', unit: 'bool' },
        ];
        const state = await simVarService.getSimVars(stateVars);

        const result: Record<string, unknown> = {
          success: true,
          action: args.action,
          gear_position_pct: state['GEAR TOTAL PCT EXTENDED'],
          gear_handle_up: Number(state['GEAR HANDLE POSITION']) !== 1,
          on_ground: Number(state['SIM ON GROUND']) === 1,
          parking_brake_on: Number(state['BRAKE PARKING POSITION']) === 1,
        };

        if (args.parking_brake) {
          result['parking_brake_action'] = args.parking_brake;
        }

        if (warnings.length > 0) {
          result['warnings'] = warnings;
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
