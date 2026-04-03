export enum SafetyProfile {
  Unrestricted = 'unrestricted',
  Safe = 'safe',
  Readonly = 'readonly',
}

export interface ServerConfig {
  safetyProfile: SafetyProfile;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  maxSubscriptions: number;
  reconnectMaxDelayMs: number;
}
