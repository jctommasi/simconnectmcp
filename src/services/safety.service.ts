import { SafetyProfile } from '../types/config.types.js';
import { config } from '../config.js';
import { Logger } from '../logger.js';

export interface SafetyCheckResult {
  allowed: boolean;
  warning?: string;
  reason?: string;
}

/**
 * Actions that are considered write operations (blocked in readonly mode).
 */
const WRITE_ACTIONS = new Set([
  'set_simvar',
  'send_event',
  'set_aircraft_position',
  'control_engine',
  'set_autopilot',
  'set_radio_frequency',
  'control_lights',
  'control_landing_gear',
  'control_flaps',
  'control_sim_rate',
  'pause_sim',
  'set_lvar',
  'trigger_h_event',
  'execute_calculator_code',
]);

/**
 * Actions that are considered dangerous (warned in safe mode).
 */
const DANGEROUS_ACTIONS: Record<string, string> = {
  set_aircraft_position:
    'Teleporting the aircraft can cause unexpected behavior or crashes',
  execute_calculator_code:
    'Executing arbitrary RPN calculator code can modify any simulator state',
  set_lvar:
    'Writing local variables can affect complex aircraft systems in unpredictable ways',
};

/**
 * Details patterns that indicate dangerous usage in safe mode.
 */
function checkDangerousDetails(
  action: string,
  details?: Record<string, unknown>
): string | undefined {
  if (!details) return undefined;

  if (action === 'control_engine') {
    const param = details['parameter'] as string | undefined;
    const value = details['value_pct'] as number | undefined;
    if (param === 'throttle' && value === 0) {
      return 'Setting throttle to 0% will shut down the engine';
    }
    if (param === 'mixture' && value === 0) {
      return 'Setting mixture to 0% will cut off fuel to the engine';
    }
  }

  if (action === 'set_simvar') {
    const name = details['name'] as string | undefined;
    if (name && /altitude/i.test(name)) {
      const value = details['value'] as number | undefined;
      if (value !== undefined && (value > 60000 || value < 0)) {
        return `Setting altitude to ${value} is an extreme value that may cause instability`;
      }
    }
  }

  return undefined;
}

export class SafetyService {
  private static _instance: SafetyService | undefined;

  private readonly _profile: SafetyProfile;
  private readonly _logger: Logger;

  private constructor() {
    this._profile = config.safetyProfile;
    this._logger = new Logger(config.logLevel);
    this._logger.info(`Safety profile: ${this._profile}`);
  }

  static getInstance(): SafetyService {
    if (!SafetyService._instance) {
      SafetyService._instance = new SafetyService();
    }
    return SafetyService._instance;
  }

  getProfile(): SafetyProfile {
    return this._profile;
  }

  checkAction(
    action: string,
    details?: Record<string, unknown>
  ): SafetyCheckResult {
    // Unrestricted: everything allowed, no warnings
    if (this._profile === SafetyProfile.Unrestricted) {
      return { allowed: true };
    }

    // Readonly: block all write operations
    if (this._profile === SafetyProfile.Readonly) {
      if (WRITE_ACTIONS.has(action)) {
        return {
          allowed: false,
          reason: `Action '${action}' is blocked in readonly safety profile. Switch to 'safe' or 'unrestricted' profile to perform write operations.`,
        };
      }
      return { allowed: true };
    }

    // Safe mode: allow everything but warn on dangerous actions
    const dangerousWarning = DANGEROUS_ACTIONS[action];
    if (dangerousWarning) {
      this._logger.warn(`Safety warning for '${action}': ${dangerousWarning}`);
      return { allowed: true, warning: dangerousWarning };
    }

    const detailsWarning = checkDangerousDetails(action, details);
    if (detailsWarning) {
      this._logger.warn(`Safety warning for '${action}': ${detailsWarning}`);
      return { allowed: true, warning: detailsWarning };
    }

    return { allowed: true };
  }
}
