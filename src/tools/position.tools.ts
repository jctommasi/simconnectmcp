import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SimConnectService } from '../services/simconnect.service.js';
import { SimVarService } from '../services/simvar.service.js';
import { EventService } from '../services/event.service.js';
import { SafetyService } from '../services/safety.service.js';

export function registerPositionTools(server: McpServer): void {
  const simConnect = SimConnectService.getInstance();
  const simVarService = new SimVarService(simConnect);
  const eventService = new EventService(simConnect);
  const safety = SafetyService.getInstance();

  server.tool(
    'get_aircraft_position',
    "Read the aircraft's full position and motion data. Returns latitude, longitude, altitude (feet), heading (degrees true), ground speed (knots), vertical speed (fpm), pitch and bank angles (degrees), and whether the aircraft is on the ground.",
    {},
    async () => {
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

        const vars = [
          { name: 'PLANE LATITUDE', unit: 'degrees' },
          { name: 'PLANE LONGITUDE', unit: 'degrees' },
          { name: 'PLANE ALTITUDE', unit: 'feet' },
          { name: 'PLANE HEADING DEGREES TRUE', unit: 'degrees' },
          { name: 'GROUND VELOCITY', unit: 'knots' },
          { name: 'VERTICAL SPEED', unit: 'feet per minute' },
          { name: 'PLANE PITCH DEGREES', unit: 'degrees' },
          { name: 'PLANE BANK DEGREES', unit: 'degrees' },
          { name: 'SIM ON GROUND', unit: 'bool' },
        ];

        const values = await simVarService.getSimVars(vars);

        const position = {
          latitude: values['PLANE LATITUDE'],
          longitude: values['PLANE LONGITUDE'],
          altitude_ft: values['PLANE ALTITUDE'],
          heading_deg: values['PLANE HEADING DEGREES TRUE'],
          ground_speed_kts: values['GROUND VELOCITY'],
          vertical_speed_fpm: values['VERTICAL SPEED'],
          pitch_deg: values['PLANE PITCH DEGREES'],
          bank_deg: values['PLANE BANK DEGREES'],
          on_ground: values['SIM ON GROUND'] === 1,
        };

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(position, null, 2),
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
    'set_aircraft_position',
    "Teleport the aircraft to a new position. Activates slew mode, sets the position, then deactivates slew mode. Example: set_aircraft_position({latitude: 47.4502, longitude: -122.3088, altitude_ft: 3000, heading_deg: 180}). Latitude: [-90, 90], Longitude: [-180, 180], Altitude: >= 0.",
    {
      latitude: z
        .number()
        .min(-90)
        .max(90)
        .describe('Latitude in decimal degrees (-90 to 90)'),
      longitude: z
        .number()
        .min(-180)
        .max(180)
        .describe('Longitude in decimal degrees (-180 to 180)'),
      altitude_ft: z
        .number()
        .min(0)
        .describe('Altitude in feet above sea level (>= 0)'),
      heading_deg: z
        .number()
        .min(0)
        .max(360)
        .describe('Heading in degrees true (0-360)'),
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

        const safetyCheck = safety.checkAction('set_aircraft_position', {
          latitude: args.latitude,
          longitude: args.longitude,
          altitude_ft: args.altitude_ft,
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

        // Activate slew mode
        await eventService.sendEvent('SLEW_ON');

        // Set position SimVars
        await simVarService.setSimVar(
          'PLANE LATITUDE',
          'degrees',
          args.latitude
        );
        await simVarService.setSimVar(
          'PLANE LONGITUDE',
          'degrees',
          args.longitude
        );
        await simVarService.setSimVar(
          'PLANE ALTITUDE',
          'feet',
          args.altitude_ft
        );
        await simVarService.setSimVar(
          'PLANE HEADING DEGREES TRUE',
          'degrees',
          args.heading_deg
        );

        // Deactivate slew mode
        await eventService.sendEvent('SLEW_OFF');

        const result: Record<string, unknown> = {
          success: true,
          latitude: args.latitude,
          longitude: args.longitude,
          altitude_ft: args.altitude_ft,
          heading_deg: args.heading_deg,
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
        // Try to deactivate slew mode even on error
        try {
          await eventService.sendEvent('SLEW_OFF');
        } catch {
          // Ignore slew-off error during cleanup
        }
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
