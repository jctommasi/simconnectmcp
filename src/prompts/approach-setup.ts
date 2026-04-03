import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export function registerApproachSetupPrompt(server: McpServer): void {
  server.prompt(
    'approach_setup',
    'Guides through configuring an instrument approach including NAV frequency, course, autopilot settings, and approach checklist items',
    {
      approach_type: z.enum(['ILS', 'RNAV', 'VOR']).describe('Type of approach: ILS, RNAV, or VOR'),
      runway: z.string().optional().describe('Runway identifier (e.g., "09L", "27R")'),
      frequency: z.number().optional().describe('Approach NAV frequency in MHz (e.g., 110.30 for ILS)'),
    },
    (args) => {
      const runwayInfo = args.runway ? `\nRunway: ${args.runway}` : '';
      const freqInfo = args.frequency ? `\nApproach frequency: ${args.frequency} MHz` : '';

      const approachSpecific: Record<string, string> = {
        ILS: `
**ILS-Specific Steps:**
- Tune the ILS localizer frequency on NAV1
- Verify the glideslope is alive and centered
- Set the inbound course on the HSI/CDI
- Arm approach mode on the autopilot (AP_APR_HOLD)
- Monitor localizer and glideslope capture
- At decision altitude, call "Runway in sight" or "Going around"`,
        RNAV: `
**RNAV-Specific Steps:**
- Verify GPS flight plan has the correct approach loaded
- Confirm LNAV/VNAV or LPV approach is active
- Monitor GPS track and vertical path deviation
- Cross-check with distance to threshold
- At MDA/DA, call "Runway in sight" or "Going around"`,
        VOR: `
**VOR-Specific Steps:**
- Tune the VOR frequency on NAV1 or NAV2
- Set the inbound course on the OBS/HSI
- Identify the VOR (verify morse code ident)
- Track inbound on the selected radial
- Monitor DME distance if available
- At MDA, call "Runway in sight" or "Going around"`,
      };

      return {
        description: `${args.approach_type} approach setup and guidance`,
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: `Please configure and guide me through a **${args.approach_type}** instrument approach.${runwayInfo}${freqInfo}

**Step 1 — Verify Current State:**
1. Call \`get_aircraft_position\` to check current position, altitude, and heading
2. Call \`get_autopilot_state\` to review current autopilot configuration
3. Call \`get_radio_frequencies\` to check current NAV frequency settings

**Step 2 — Configure Approach:**
${args.frequency ? `4. Call \`set_radio_frequency\` to set NAV1 to ${args.frequency} MHz for the ${args.approach_type} approach` : `4. Set the appropriate NAV frequency using \`set_radio_frequency\` if needed`}
5. Call \`set_autopilot\` with action \`set_altitude\` to set the initial approach altitude
6. Call \`set_autopilot\` with action \`set_heading\` to set the inbound course heading
7. Call \`set_autopilot\` with action \`toggle_approach\` to arm approach mode
8. Call \`set_autopilot\` with action \`toggle_nav\` to arm NAV mode if needed
${approachSpecific[args.approach_type]}

**Step 3 — Approach Checklist:**
- [ ] NAV frequency: set and identified
- [ ] Inbound course: set on autopilot heading bug
- [ ] Approach altitude: set
- [ ] Autopilot approach mode: armed
- [ ] Speed: appropriate for approach phase
- [ ] Flaps: configured for approach
- [ ] Landing gear: consider extending when established
- [ ] Lights: landing lights ON

**Step 4 — Monitor Approach:**
Periodically call \`get_aircraft_position\` and \`get_autopilot_state\` to monitor:
- Lateral deviation from approach course
- Vertical path adherence
- Speed management
- Distance to threshold

Present the approach configuration status and provide callouts at key points.`,
            },
          },
        ],
      };
    }
  );
}
