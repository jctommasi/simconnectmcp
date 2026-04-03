import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export function registerPreFlightChecklistPrompt(server: McpServer): void {
  server.prompt(
    'pre_flight_checklist',
    'Guides through a pre-flight checklist verifying aircraft systems, controls, instruments, radios, and lights using simulator tools',
    {
      aircraft_type: z.string().optional().describe('Aircraft type for context-specific procedures (e.g., "Boeing 737", "Cessna 172")'),
    },
    (args) => {
      const aircraftContext = args.aircraft_type
        ? `The aircraft type is: ${args.aircraft_type}. Adapt the checklist to this aircraft's specific systems and procedures.\n\n`
        : '';

      return {
        description: 'Pre-flight checklist verified against live simulator data',
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: `${aircraftContext}Please execute a pre-flight checklist by verifying each item using the appropriate simulator tool. For each item, call the tool, check the result, and report the status (PASS / FAIL / CAUTION).

**Pre-Flight Checklist:**

1. **Battery & Electrical** — Call \`get_systems_status\`
   - [ ] Battery switch: ON
   - [ ] Generator: ON
   - [ ] Bus voltage: within normal range

2. **Fuel Quantity** — Call \`get_fuel_payload\`
   - [ ] Total fuel: adequate for planned flight
   - [ ] Fuel balance: check total weight and CG position
   - [ ] Estimated endurance: sufficient with reserves

3. **Flight Controls** — Call \`get_simvar\` with names ["ELEVATOR POSITION", "AILERON POSITION", "RUDDER POSITION"] unit "position"
   - [ ] Elevator: free and correct
   - [ ] Ailerons: free and correct
   - [ ] Rudder: free and correct

4. **Instruments** — Call \`get_aircraft_position\` and \`get_autopilot_state\`
   - [ ] Altimeter: set and reading correctly
   - [ ] Heading indicator: aligned
   - [ ] Autopilot: initially disengaged (or as desired)

5. **Radios** — Call \`get_radio_frequencies\`
   - [ ] COM1: set to appropriate frequency
   - [ ] NAV1/NAV2: set for departure procedure if applicable
   - [ ] Transponder: set to assigned code (or 1200 for VFR)

6. **Navigation** — Call \`get_flight_plan\`
   - [ ] Flight plan: loaded (if applicable)
   - [ ] GPS/NAV source: configured

7. **Lights** — Call \`get_simvar\` with name "LIGHT ON STATES" unit "mask"
   - [ ] Navigation lights: ON
   - [ ] Beacon: ON
   - [ ] Taxi/Landing lights: configured for departure

8. **Engine** — Call \`get_engine_data\`
   - [ ] Engine(s) running: check RPM
   - [ ] Oil pressure: in green range
   - [ ] Oil temperature: in normal range

9. **Weather Check** — Call \`get_weather\`
   - [ ] Visibility: adequate for planned flight rules (VFR/IFR)
   - [ ] Wind: within aircraft limitations
   - [ ] Precipitation: noted

10. **Landing Gear & Brakes** — Call \`get_simvar\` with names ["GEAR HANDLE POSITION", "BRAKE PARKING POSITION"] unit "bool"
    - [ ] Gear: down and locked (for ground operations)
    - [ ] Parking brake: SET

**After completing all checks, provide a summary:**
- Total items checked
- Items passed / failed / caution
- Overall GO / NO-GO recommendation`,
            },
          },
        ],
      };
    }
  );
}
