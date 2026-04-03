import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SimConnectService } from '../services/simconnect.service.js';
import { SimVarService } from '../services/simvar.service.js';

export function registerSystemsTools(server: McpServer): void {
  const simConnect = SimConnectService.getInstance();
  const simVarService = new SimVarService(simConnect);

  server.tool(
    'get_systems_status',
    "Read aircraft systems status: electrical (battery, generator, bus voltage), hydraulic (pressure), pressurization (cabin altitude, differential pressure), and anti-ice (pitot heat, structural de-ice). Read-only tool.",
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

        const vars = [
          { name: 'ELECTRICAL MASTER BATTERY', unit: 'bool' },
          { name: 'GENERAL ENG GENERATOR SWITCH:1', unit: 'bool' },
          { name: 'ELECTRICAL MAIN BUS VOLTAGE', unit: 'volts' },
          { name: 'HYDRAULIC PRESSURE:1', unit: 'pounds per square foot' },
          { name: 'PRESSURIZATION CABIN ALTITUDE', unit: 'feet' },
          { name: 'PRESSURIZATION PRESSURE DIFFERENTIAL', unit: 'pounds per square inch' },
          { name: 'PITOT HEAT', unit: 'bool' },
          { name: 'STRUCTURAL DEICE SWITCH', unit: 'bool' },
        ];

        const values = await simVarService.getSimVars(vars);

        const result = {
          electrical: {
            battery_on: Number(values['ELECTRICAL MASTER BATTERY']) === 1,
            generator_on: Number(values['GENERAL ENG GENERATOR SWITCH:1']) === 1,
            bus_voltage: Math.round((values['ELECTRICAL MAIN BUS VOLTAGE'] as number) * 10) / 10,
          },
          hydraulic: {
            pressure: Math.round(values['HYDRAULIC PRESSURE:1'] as number),
          },
          pressurization: {
            cabin_alt_ft: Math.round(values['PRESSURIZATION CABIN ALTITUDE'] as number),
            diff_pressure_psi:
              Math.round((values['PRESSURIZATION PRESSURE DIFFERENTIAL'] as number) * 100) / 100,
          },
          anti_ice: {
            pitot_heat: Number(values['PITOT HEAT']) === 1,
            structural_deice: Number(values['STRUCTURAL DEICE SWITCH']) === 1,
          },
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
}
