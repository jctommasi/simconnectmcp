import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { EVENT_CATALOG } from '../data/event-definitions.js';

export function registerEventCatalogResource(server: McpServer): void {
  server.resource(
    'event-catalog',
    'simconnect://catalog/events',
    { mimeType: 'application/json', description: 'Complete catalog of available SimConnect Key Events grouped by category' },
    () => {
      const grouped: Record<string, Array<{ name: string; description: string; hasParam: boolean; paramDescription?: string }>> = {};

      for (const ev of EVENT_CATALOG) {
        if (!grouped[ev.category]) {
          grouped[ev.category] = [];
        }
        const entry: { name: string; description: string; hasParam: boolean; paramDescription?: string } = {
          name: ev.name,
          description: ev.description,
          hasParam: ev.hasParam,
        };
        if (ev.paramDescription) {
          entry.paramDescription = ev.paramDescription;
        }
        grouped[ev.category].push(entry);
      }

      return {
        contents: [
          {
            uri: 'simconnect://catalog/events',
            mimeType: 'application/json',
            text: JSON.stringify(grouped, null, 2),
          },
        ],
      };
    }
  );
}
