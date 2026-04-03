import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export function registerFlightBriefingPrompt(server: McpServer): void {
  server.prompt(
    'flight_briefing',
    'Generates a comprehensive pilot-style flight briefing by reading aircraft position, weather, flight plan, fuel, and systems status',
    {
      aircraft_type: z.string().optional().describe('Aircraft type for context-specific procedures (e.g., "Boeing 737", "Cessna 172")'),
    },
    (args) => {
      const aircraftContext = args.aircraft_type
        ? `The aircraft type is: ${args.aircraft_type}. Tailor the briefing to this aircraft's characteristics.\n\n`
        : '';

      return {
        description: 'Comprehensive flight briefing compiled from live simulator data',
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: `${aircraftContext}Please compile a comprehensive pilot-style flight briefing by gathering the following data from the simulator. Call each tool and then present the information in a structured briefing format.

**Step 1 — Gather Data:**
1. Call \`get_aircraft_position\` to get current position, altitude, heading, and ground speed
2. Call \`get_weather\` to get current meteorological conditions (temperature, wind, visibility, barometric pressure)
3. Call \`get_flight_plan\` to get the loaded flight plan with waypoints, distances, and ETE
4. Call \`get_fuel_payload\` to get fuel quantity, fuel flow, estimated endurance, and aircraft weight
5. Call \`get_systems_status\` to get electrical, hydraulic, pressurization, and anti-ice system states

**Step 2 — Compile Briefing:**
Present the data as a structured flight briefing with these sections:
- **Aircraft & Position**: Current location (lat/lon), altitude, heading, ground speed, on-ground status
- **Weather**: Temperature, wind (direction and speed), visibility, barometric pressure, precipitation
- **Flight Plan**: Origin, destination, total waypoints, active waypoint, distance remaining, ETE
- **Fuel & Weight**: Total fuel, fuel flow, estimated endurance, total weight, CG position
- **Systems**: Battery, generator, bus voltage, hydraulic pressure, cabin altitude, pitot heat, deice status
- **Assessment**: Brief overall assessment of readiness for flight based on the gathered data`,
            },
          },
        ],
      };
    }
  );
}
