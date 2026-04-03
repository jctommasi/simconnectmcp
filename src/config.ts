import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SafetyProfile, type ServerConfig } from './types/config.types.js';

const CONFIG_FILENAME = 'simconnect-mcp.config.json';

const DEFAULTS: ServerConfig = {
  safetyProfile: SafetyProfile.Safe,
  logLevel: 'info',
  maxSubscriptions: 50,
  reconnectMaxDelayMs: 30000,
};

function loadConfigFile(): Partial<ServerConfig> {
  try {
    const configPath = resolve(process.cwd(), CONFIG_FILENAME);
    const raw = readFileSync(configPath, 'utf-8');
    return JSON.parse(raw) as Partial<ServerConfig>;
  } catch {
    return {};
  }
}

export function loadConfig(): ServerConfig {
  const fileConfig = loadConfigFile();
  return {
    ...DEFAULTS,
    ...fileConfig,
  };
}

export const config = loadConfig();
