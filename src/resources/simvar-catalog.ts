import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SIMVAR_CATALOG } from '../data/simvar-definitions.js';

export function registerSimVarCatalogResource(server: McpServer): void {
  server.resource(
    'simvar-catalog',
    'simconnect://catalog/simvars',
    { mimeType: 'application/json', description: 'Complete catalog of available SimConnect simulation variables grouped by category' },
    () => {
      const grouped: Record<string, Array<{ name: string; units: string; writable: boolean; type: string; description: string }>> = {};

      for (const sv of SIMVAR_CATALOG) {
        if (!grouped[sv.category]) {
          grouped[sv.category] = [];
        }
        grouped[sv.category].push({
          name: sv.name,
          units: sv.units,
          writable: sv.writable,
          type: sv.type,
          description: sv.description,
        });
      }

      return {
        contents: [
          {
            uri: 'simconnect://catalog/simvars',
            mimeType: 'application/json',
            text: JSON.stringify(grouped, null, 2),
          },
        ],
      };
    }
  );
}
