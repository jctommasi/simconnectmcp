import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SimConnectService } from '../services/simconnect.service.js';
import { SafetyService } from '../services/safety.service.js';
import { SafetyProfile } from '../types/config.types.js';

const PROFILE_DESCRIPTIONS: Record<SafetyProfile, string> = {
  [SafetyProfile.Unrestricted]:
    'All actions are allowed without any restrictions or warnings.',
  [SafetyProfile.Safe]:
    'All actions are allowed, but dangerous actions (teleport, calculator code, L:vars, engine shutdown) produce warnings.',
  [SafetyProfile.Readonly]:
    'Only read operations are allowed. All write operations (setting SimVars, sending events, controlling aircraft) are blocked.',
};

export function registerConnectionTools(server: McpServer): void {
  const simConnect = SimConnectService.getInstance();
  const safety = SafetyService.getInstance();

  server.tool(
    'simconnect_connect',
    'Connect to Microsoft Flight Simulator 2024 via SimConnect. Must be called before using any other SimConnect tools. The simulator must be running.',
    {},
    async () => {
      try {
        const result = await simConnect.connect();
        if (result.connected) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  { connected: true, simName: result.simName },
                  null,
                  2
                ),
              },
            ],
          };
        }
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  connected: false,
                  error:
                    'Failed to connect to SimConnect. Make sure MSFS 2024 is running.',
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                { connected: false, error: message },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'simconnect_disconnect',
    'Disconnect from Microsoft Flight Simulator 2024. Closes the SimConnect connection gracefully.',
    {},
    async () => {
      try {
        await simConnect.disconnect();
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ disconnected: true }, null, 2),
            },
          ],
        };
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                { disconnected: false, error: message },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'get_safety_profile',
    'Get the current safety profile that controls what level of access Claude has to the simulator. Profiles: unrestricted (all allowed), safe (warns on dangerous actions), readonly (blocks all writes).',
    {},
    async () => {
      const profile = safety.getProfile();
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                profile,
                description: PROFILE_DESCRIPTIONS[profile],
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );
}
