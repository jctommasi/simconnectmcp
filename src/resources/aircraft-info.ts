import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SimConnectService } from '../services/simconnect.service.js';
import { SimVarService } from '../services/simvar.service.js';

export function registerAircraftInfoResource(server: McpServer): void {
  const simConnect = SimConnectService.getInstance();
  const simVarService = new SimVarService(simConnect);

  server.resource(
    'aircraft-info',
    'simconnect://aircraft/info',
    { mimeType: 'application/json', description: 'Current aircraft details including type, model, callsign, and engine configuration' },
    async () => {
      if (!simConnect.isConnected) {
        return {
          contents: [
            {
              uri: 'simconnect://aircraft/info',
              mimeType: 'application/json',
              text: JSON.stringify(
                { message: 'Not connected to SimConnect. Use simconnect_connect first.' },
                null,
                2
              ),
            },
          ],
        };
      }

      try {
        const data = await simVarService.getSimVars([
          { name: 'TITLE', unit: 'string64' },
          { name: 'ATC TYPE', unit: 'string64' },
          { name: 'ATC MODEL', unit: 'string64' },
          { name: 'ATC ID', unit: 'string64' },
          { name: 'NUMBER OF ENGINES', unit: 'number' },
          { name: 'ENGINE TYPE', unit: 'number' },
        ]);

        const engineTypeMap: Record<number, string> = {
          0: 'Piston',
          1: 'Jet',
          2: 'None',
          3: 'Helo (turbine)',
          4: 'Unsupported',
          5: 'Turboprop',
        };

        const engineTypeNum = typeof data['ENGINE TYPE'] === 'number' ? data['ENGINE TYPE'] : 0;

        const cleanStr = (v: string | number): string =>
          String(v).replace(/\0/g, '').trim();

        const info = {
          title: cleanStr(data['TITLE']),
          atc_type: cleanStr(data['ATC TYPE']),
          atc_model: cleanStr(data['ATC MODEL']),
          atc_id: cleanStr(data['ATC ID']),
          number_of_engines: typeof data['NUMBER OF ENGINES'] === 'number'
            ? data['NUMBER OF ENGINES']
            : Number(data['NUMBER OF ENGINES']),
          engine_type: engineTypeMap[engineTypeNum] ?? `Unknown (${engineTypeNum})`,
        };

        return {
          contents: [
            {
              uri: 'simconnect://aircraft/info',
              mimeType: 'application/json',
              text: JSON.stringify(info, null, 2),
            },
          ],
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          contents: [
            {
              uri: 'simconnect://aircraft/info',
              mimeType: 'application/json',
              text: JSON.stringify({ error: message }, null, 2),
            },
          ],
        };
      }
    }
  );
}
