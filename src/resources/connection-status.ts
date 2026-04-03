import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SimConnectService } from '../services/simconnect.service.js';
import { SafetyService } from '../services/safety.service.js';
import { WASimService } from '../services/wasim.service.js';
import { getActiveSubscriptionCount } from '../tools/subscription.tools.js';

export function registerConnectionStatusResource(server: McpServer): void {
  const simConnect = SimConnectService.getInstance();
  const safety = SafetyService.getInstance();
  const wasim = WASimService.getInstance();

  server.resource(
    'connection-status',
    'simconnect://status',
    { mimeType: 'application/json', description: 'Current SimConnect connection status, safety profile, WASimCommander availability, and active subscriptions' },
    async () => {
      const connected = simConnect.isConnected;
      const connectedAt = simConnect.connectedAt;
      const uptimeSeconds = connected && connectedAt !== null
        ? Math.round((Date.now() - connectedAt) / 1000)
        : 0;

      const status = {
        connected,
        sim_name: simConnect.simName || '',
        uptime_seconds: uptimeSeconds,
        safety_profile: safety.getProfile(),
        wasim_available: wasim.isAvailable,
        active_subscriptions: getActiveSubscriptionCount(),
      };

      return {
        contents: [
          {
            uri: 'simconnect://status',
            mimeType: 'application/json',
            text: JSON.stringify(status, null, 2),
          },
        ],
      };
    }
  );
}
