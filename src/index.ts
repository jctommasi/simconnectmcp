import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { Logger } from './logger.js';
import { SimConnectService } from './services/simconnect.service.js';
import { registerConnectionTools } from './tools/connection.tools.js';
import { registerSimVarTools } from './tools/simvar.tools.js';
import { registerEventTools } from './tools/event.tools.js';
import { registerPositionTools } from './tools/position.tools.js';
import { registerEngineTools } from './tools/engine.tools.js';
import { registerAutopilotTools } from './tools/autopilot.tools.js';
import { registerRadioTools } from './tools/radio.tools.js';
import { registerFlightPlanTools } from './tools/flightplan.tools.js';
import { registerLightsTools } from './tools/lights.tools.js';
import { registerGearTools } from './tools/gear.tools.js';
import { registerFlapsTools } from './tools/flaps.tools.js';
import { registerSimulationTools } from './tools/simulation.tools.js';
import { registerWeatherTools } from './tools/weather.tools.js';
import { registerSystemsTools } from './tools/systems.tools.js';
import { registerFuelTools } from './tools/fuel.tools.js';
import { registerWASimTools } from './tools/wasim.tools.js';
import { registerSubscriptionTools } from './tools/subscription.tools.js';
import { registerSimVarCatalogResource } from './resources/simvar-catalog.js';
import { registerEventCatalogResource } from './resources/event-catalog.js';
import { registerAircraftInfoResource } from './resources/aircraft-info.js';
import { registerConnectionStatusResource } from './resources/connection-status.js';
import { registerFlightBriefingPrompt } from './prompts/flight-briefing.js';
import { registerPreFlightChecklistPrompt } from './prompts/preflight-checklist.js';
import { registerApproachSetupPrompt } from './prompts/approach-setup.js';
import { registerEmergencyProceduresPrompt } from './prompts/emergency.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(resolve(__dirname, '..', 'package.json'), 'utf-8')
) as { version: string };

const logger = new Logger(config.logLevel);

const server = new McpServer(
  {
    name: 'simconnect-msfs2024',
    version: pkg.version,
  },
  {
    capabilities: {
      tools: {},
      resources: {},
      prompts: {},
    },
  }
);

// Registration functions that subsequent stories will populate
export function registerTools(server: McpServer): void {
  registerConnectionTools(server);
  registerSimVarTools(server);
  registerEventTools(server);
  registerPositionTools(server);
  registerEngineTools(server);
  registerAutopilotTools(server);
  registerRadioTools(server);
  registerFlightPlanTools(server);
  registerLightsTools(server);
  registerGearTools(server);
  registerFlapsTools(server);
  registerSimulationTools(server);
  registerWeatherTools(server);
  registerSystemsTools(server);
  registerFuelTools(server);
  registerWASimTools(server);
  registerSubscriptionTools(server);
}

export function registerResources(server: McpServer): void {
  registerSimVarCatalogResource(server);
  registerEventCatalogResource(server);
  registerAircraftInfoResource(server);
  registerConnectionStatusResource(server);
}

export function registerPrompts(server: McpServer): void {
  registerFlightBriefingPrompt(server);
  registerPreFlightChecklistPrompt(server);
  registerApproachSetupPrompt(server);
  registerEmergencyProceduresPrompt(server);
}

async function main(): Promise<void> {
  logger.info('Starting SimConnect MCP Server...');

  registerTools(server);
  registerResources(server);
  registerPrompts(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info(`SimConnect MCP Server v${pkg.version} running on stdio`);
  logger.info(`Safety profile: ${config.safetyProfile}`);
}

function shutdown(): void {
  logger.info('Shutting down SimConnect MCP Server...');
  const simConnect = SimConnectService.getInstance();
  simConnect.disconnect().then(() => {
    process.exit(0);
  }).catch(() => {
    process.exit(1);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

main().catch((err: unknown) => {
  logger.error('Fatal error starting server', err);
  process.exit(1);
});
