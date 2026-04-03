import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export function registerEmergencyProceduresPrompt(server: McpServer): void {
  server.prompt(
    'emergency_procedures',
    'Guides through emergency procedures for engine failure, electrical failure, pressurization loss, fire, or general emergencies using simulator tools',
    {
      emergency_type: z.enum(['engine_failure', 'electrical_failure', 'pressurization', 'fire', 'general']).describe('Type of emergency: engine_failure, electrical_failure, pressurization, fire, or general'),
    },
    (args) => {
      const procedures: Record<string, string> = {
        engine_failure: `**ENGINE FAILURE PROCEDURES**

**Immediate Actions (Memory Items):**
1. Call \`get_engine_data\` to identify which engine(s) have failed (check RPM, N1, fuel flow)
2. Call \`get_aircraft_position\` to assess altitude, speed, and proximity to airports

**Diagnosis:**
3. Call \`get_systems_status\` to check electrical and hydraulic systems affected by the engine loss
4. Call \`get_fuel_payload\` to assess remaining fuel and endurance

**Actions:**
5. For single-engine failure in multi-engine aircraft:
   - Call \`control_engine\` to verify throttle settings on operative engine(s)
   - Call \`set_autopilot\` to adjust altitude and heading toward nearest suitable airport
6. For total engine failure:
   - Call \`get_aircraft_position\` repeatedly to monitor glide path
   - Call \`set_autopilot\` with action \`set_speed\` to target best glide speed
   - Call \`send_event\` to set transponder to 7700 (emergency)

**Monitoring:**
- Continuously monitor altitude loss rate via \`get_aircraft_position\`
- Monitor engine parameters via \`get_engine_data\` for possible restart
- Track distance to nearest airport via \`get_flight_plan\``,

        electrical_failure: `**ELECTRICAL FAILURE PROCEDURES**

**Immediate Actions (Memory Items):**
1. Call \`get_systems_status\` to diagnose electrical system state (battery, generator, bus voltage)
2. Call \`get_engine_data\` to verify engines are still running

**Diagnosis:**
3. Check bus voltage — if zero, total electrical failure
4. If generator off but battery on, limited time on battery power
5. Call \`get_aircraft_position\` to note current position and altitude

**Actions:**
6. If generator failure:
   - Attempt reset via \`send_event\` with TOGGLE_MASTER_ALTERNATOR
   - Shed non-essential electrical loads
7. If total electrical failure:
   - Call \`get_aircraft_position\` to maintain situational awareness
   - Navigate by visual references or standby instruments
   - Divert to nearest VFR airport
8. Call \`set_radio_frequency\` to set COM1 to 121.50 MHz (emergency frequency) if radios available

**Monitoring:**
- Monitor battery voltage via \`get_systems_status\` — battery life is limited
- Track position via \`get_aircraft_position\`
- Monitor engine health via \`get_engine_data\``,

        pressurization: `**PRESSURIZATION FAILURE PROCEDURES**

**Immediate Actions (Memory Items):**
1. Call \`get_systems_status\` to check cabin altitude and differential pressure
2. If cabin altitude exceeds 10,000 ft — EMERGENCY DESCENT REQUIRED

**Diagnosis:**
3. Call \`get_aircraft_position\` to check current altitude
4. Determine if rapid decompression (sudden) or slow leak (gradual cabin altitude climb)

**Actions:**
5. Emergency descent:
   - Call \`set_autopilot\` with action \`set_vs\` to set maximum descent rate (e.g., -4000 to -6000 fpm)
   - Call \`set_autopilot\` with action \`set_altitude\` to target 10,000 ft or MEA (whichever is higher)
   - Call \`control_engine\` to reduce throttle as needed for descent
6. Call \`send_event\` to set transponder to 7700
7. Call \`set_radio_frequency\` to tune emergency frequency 121.50 if needed

**Monitoring:**
- Monitor cabin altitude via \`get_systems_status\` until below 10,000 ft
- Monitor descent rate and altitude via \`get_aircraft_position\`
- Check engine parameters via \`get_engine_data\` during high-speed descent`,

        fire: `**FIRE PROCEDURES**

**Immediate Actions (Memory Items):**
1. Call \`get_engine_data\` to check engine temperatures (EGT) for engine fire indication
2. Call \`get_systems_status\` to check electrical system for electrical fire indication

**Diagnosis:**
3. Determine fire location:
   - Engine fire: abnormally high EGT, possible engine failure
   - Electrical fire: check bus voltage anomalies, generator status
   - Cabin fire: check systems for anomalies
4. Call \`get_aircraft_position\` to assess situation and plan diversion

**Actions:**
5. For engine fire:
   - Call \`control_engine\` to shut down affected engine (throttle to 0, mixture to 0)
   - Call \`send_event\` to activate fire extinguisher if available
   - Call \`control_engine\` to set operative engine(s) for continued flight
6. For electrical fire:
   - Call \`send_event\` with TOGGLE_MASTER_BATTERY to cycle battery if needed
   - Call \`send_event\` with TOGGLE_MASTER_ALTERNATOR to shed electrical load
7. Call \`send_event\` to set transponder to 7700
8. Call \`set_autopilot\` to divert toward nearest airport

**Monitoring:**
- Monitor engine temps via \`get_engine_data\`
- Monitor systems via \`get_systems_status\`
- Track position and plan approach via \`get_aircraft_position\``,

        general: `**GENERAL EMERGENCY PROCEDURES**

**Step 1 — Assess the Situation:**
1. Call \`get_aircraft_position\` to check altitude, speed, heading, and position
2. Call \`get_engine_data\` to verify engine health (RPM, temperatures, fuel flow)
3. Call \`get_systems_status\` to check electrical, hydraulic, pressurization, and anti-ice systems
4. Call \`get_fuel_payload\` to check fuel state and endurance

**Step 2 — Identify the Problem:**
- Compare all readings against normal parameters
- Identify which system(s) are showing abnormal values
- Determine severity: can flight continue or is immediate action needed

**Step 3 — Take Action:**
5. Call \`send_event\` to squawk 7700 (emergency transponder code)
6. Call \`set_radio_frequency\` to set COM1 to 121.50 MHz if needed
7. Use \`set_autopilot\` to configure for diversion if required
8. Use \`control_engine\` to adjust engine settings as needed

**Step 4 — Monitor and Communicate:**
- Periodically call \`get_aircraft_position\` to track position
- Monitor critical systems with \`get_engine_data\` and \`get_systems_status\`
- Maintain situational awareness of nearest suitable airports via \`get_flight_plan\`

**Decision Framework:**
- If structural/controllability issue: land as soon as possible
- If systems degradation: land at nearest suitable airport
- If minor failure with redundancy: continue to destination or divert if prudent`,
      };

      return {
        description: `Emergency procedures for ${args.emergency_type.replace(/_/g, ' ')}`,
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: `An emergency situation has been declared: **${args.emergency_type.replace(/_/g, ' ').toUpperCase()}**

Please follow the procedure below, calling the specified tools at each step to diagnose the situation, execute the appropriate memory items, configure the aircraft for the emergency, and monitor critical parameters throughout.

${procedures[args.emergency_type]}

**Throughout all procedures:**
- Maintain aircraft control as the #1 priority
- Provide clear callouts at each step
- Report the status of each check (NORMAL / ABNORMAL / CRITICAL)
- Give a final assessment with recommended next actions`,
            },
          },
        ],
      };
    }
  );
}
