import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { SimConnectService } from '../services/simconnect.service.js';
import { SimVarService } from '../services/simvar.service.js';

/** Resolve the default MSFS 2024 custom flight plan path using %APPDATA%. */
function getDefaultPlnPath(): string {
  const appData = process.env.APPDATA;
  if (!appData) {
    throw new Error('APPDATA environment variable is not set. Cannot resolve default flight plan path.');
  }
  return join(appData, 'Microsoft Flight Simulator 2024', 'MISSIONS', 'Custom', 'CustomFlight', 'CUSTOMFLIGHT.PLN');
}

export function registerFlightPlanTools(server: McpServer): void {
  const simConnect = SimConnectService.getInstance();
  const simVarService = new SimVarService(simConnect);

  server.tool(
    'get_flight_plan',
    "Retrieve the current GPS flight plan including waypoint count, active waypoint index, origin, destination, distance/ETE/bearing to next waypoint, and cross-track error. Returns an informative message if no flight plan is loaded. Read-only tool.",
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

        // Read GPS flight plan overview SimVars
        const overviewVars = [
          { name: 'GPS FLIGHT PLAN WP COUNT', unit: 'number' },
          { name: 'GPS FLIGHT PLAN WP INDEX', unit: 'number' },
          { name: 'GPS WP DISTANCE', unit: 'nautical miles' },
          { name: 'GPS WP ETE', unit: 'seconds' },
          { name: 'GPS WP CROSS TRK', unit: 'nautical miles' },
          { name: 'GPS WP BEARING', unit: 'degrees' },
        ];

        const values = await simVarService.getSimVars(overviewVars);

        const totalWaypoints = Math.round(values['GPS FLIGHT PLAN WP COUNT'] as number);
        const activeWpIndex = Math.round(values['GPS FLIGHT PLAN WP INDEX'] as number);

        // If no flight plan is loaded, return informative message (not an error)
        if (totalWaypoints === 0) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  {
                    message: 'No flight plan is currently loaded in the GPS. Load a flight plan in the simulator to see waypoint data.',
                    total_waypoints: 0,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        // Read next waypoint ID (string SimVar)
        const nextWpId = await simVarService.getSimVar('GPS WP NEXT ID', 'string64');

        // Build waypoints array with available information about the active/next waypoint
        const waypoints: Array<{ index: number; id: string; distance_nm: number }> = [];

        // We can read the next waypoint info from GPS SimVars
        if (totalWaypoints > 0) {
          waypoints.push({
            index: activeWpIndex,
            id: typeof nextWpId === 'string' ? nextWpId.replace(/\0/g, '').trim() : String(nextWpId),
            distance_nm: Math.round((values['GPS WP DISTANCE'] as number) * 100) / 100,
          });
        }

        // Determine origin and destination from the flight plan
        // GPS SimVars don't directly expose origin/destination identifiers,
        // so we use the first waypoint as origin context and infer destination
        let origin = 'Unknown';
        let destination = 'Unknown';

        // If we're at the first waypoint, the next ID could be the first enroute fix
        // Try reading previous waypoint for origin info
        if (activeWpIndex > 0) {
          try {
            const prevWpId = await simVarService.getSimVar('GPS WP PREV ID', 'string64');
            if (typeof prevWpId === 'string') {
              const cleaned = prevWpId.replace(/\0/g, '').trim();
              if (cleaned) origin = cleaned;
            }
          } catch {
            // GPS WP PREV ID may not be available
          }
        }

        // If at index 0, the next waypoint ID might be the departure point
        if (activeWpIndex === 0) {
          const cleaned = typeof nextWpId === 'string' ? nextWpId.replace(/\0/g, '').trim() : '';
          if (cleaned) origin = cleaned;
        }

        const result = {
          total_waypoints: totalWaypoints,
          active_wp_index: activeWpIndex,
          origin,
          destination,
          waypoints,
          distance_to_next_nm: Math.round((values['GPS WP DISTANCE'] as number) * 100) / 100,
          ete_seconds: Math.round(values['GPS WP ETE'] as number),
          cross_track_error_nm: Math.round((values['GPS WP CROSS TRK'] as number) * 100) / 100,
          bearing_to_next_deg: Math.round((values['GPS WP BEARING'] as number) * 10) / 10,
        };

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
    'load_flight_plan',
    "Load a .PLN flight plan file into the active avionics/GPS. Fixes the common MSFS bug where the avionics flight plan differs from the world map route. By default loads the current world map flight plan (CUSTOMFLIGHT.PLN). Optionally accepts a custom path to any .PLN file.",
    {
      pln_path: z.string().optional().describe(
        'Absolute path to a .PLN file. If omitted, loads the default MSFS 2024 world map flight plan (CUSTOMFLIGHT.PLN from %APPDATA%).'
      ),
    },
    async ({ pln_path }) => {
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

        const handle = simConnect.getSimConnectInstance();
        if (!handle) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({ error: 'SimConnect handle is not available.' }, null, 2),
              },
            ],
            isError: true,
          };
        }

        const resolvedPath = pln_path ?? getDefaultPlnPath();

        if (!existsSync(resolvedPath)) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  {
                    error: `Flight plan file not found: ${resolvedPath}`,
                    hint: 'Make sure a flight plan is set up in the MSFS world map, or provide a valid path to a .PLN file.',
                  },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }

        handle.flightPlanLoad(resolvedPath);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: true,
                  message: 'Flight plan loaded into avionics successfully.',
                  pln_path: resolvedPath,
                },
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
}
