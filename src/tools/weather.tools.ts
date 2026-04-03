import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SimConnectService } from '../services/simconnect.service.js';
import { SimVarService } from '../services/simvar.service.js';

export function registerWeatherTools(server: McpServer): void {
  const simConnect = SimConnectService.getInstance();
  const simVarService = new SimVarService(simConnect);

  server.tool(
    'get_weather',
    "Read current ambient weather conditions around the aircraft: temperature (Celsius), barometric pressure (inHg), wind speed (knots) and direction (degrees), visibility (statute miles), and precipitation state (0=none, 2=rain, 4=snow, 8=freezing rain). Read-only tool.",
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
          { name: 'AMBIENT TEMPERATURE', unit: 'celsius' },
          { name: 'BAROMETER PRESSURE', unit: 'inches of mercury' },
          { name: 'AMBIENT WIND VELOCITY', unit: 'knots' },
          { name: 'AMBIENT WIND DIRECTION', unit: 'degrees' },
          { name: 'AMBIENT VISIBILITY', unit: 'statute miles' },
          { name: 'AMBIENT PRECIP STATE', unit: 'number' },
        ];

        const values = await simVarService.getSimVars(vars);

        const result = {
          temperature_c: Math.round((values['AMBIENT TEMPERATURE'] as number) * 10) / 10,
          barometer_inhg: Math.round((values['BAROMETER PRESSURE'] as number) * 100) / 100,
          wind_speed_kts: Math.round(values['AMBIENT WIND VELOCITY'] as number),
          wind_direction_deg: Math.round(values['AMBIENT WIND DIRECTION'] as number),
          visibility_sm: Math.round((values['AMBIENT VISIBILITY'] as number) * 10) / 10,
          precip_state: Math.round(values['AMBIENT PRECIP STATE'] as number),
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
