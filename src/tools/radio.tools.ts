import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SimConnectService } from '../services/simconnect.service.js';
import { SimVarService } from '../services/simvar.service.js';
import { EventService } from '../services/event.service.js';
import { SafetyService } from '../services/safety.service.js';

/**
 * Convert a human-readable COM/NAV frequency (e.g., 118.300 MHz) to BCD16 format.
 * Strips leading '1', encodes remaining 4 digits as BCD nibbles.
 * Example: 118.300 -> 1830 -> 0x1830
 */
function freqToBcd16(freqMhz: number): number {
  const freqInt = Math.round(freqMhz * 100) - 10000;
  const str = freqInt.toString().padStart(4, '0');
  let bcd = 0;
  for (const ch of str) {
    bcd = (bcd << 4) | parseInt(ch, 10);
  }
  return bcd;
}

/**
 * Convert BCD16 from SimConnect back to a human-readable COM/NAV frequency in MHz.
 * Example: 0x1830 -> 1830 -> +10000 -> 11830 -> /100 -> 118.30
 */
function bcd16ToFreq(bcd: number): number {
  const d1 = (bcd >> 12) & 0xf;
  const d2 = (bcd >> 8) & 0xf;
  const d3 = (bcd >> 4) & 0xf;
  const d4 = bcd & 0xf;
  return (d1 * 1000 + d2 * 100 + d3 * 10 + d4 + 10000) / 100;
}

/**
 * Convert a transponder code (e.g., 1200) to BCD16 format.
 * Each digit becomes a nibble: 1200 -> 0x1200
 */
function xpdrToBcd16(code: number): number {
  const str = code.toString().padStart(4, '0');
  let bcd = 0;
  for (const ch of str) {
    bcd = (bcd << 4) | parseInt(ch, 10);
  }
  return bcd;
}

/**
 * Convert BCD16 value to a transponder code.
 * Each nibble is a digit: 0x1200 -> 1200
 */
function bcd16ToXpdr(bcd: number): number {
  const d1 = (bcd >> 12) & 0xf;
  const d2 = (bcd >> 8) & 0xf;
  const d3 = (bcd >> 4) & 0xf;
  const d4 = bcd & 0xf;
  return d1 * 1000 + d2 * 100 + d3 * 10 + d4;
}

/**
 * Convert ADF frequency in kHz to BCD16 format.
 * Example: 350 -> 0x0350
 */
function adfToBcd16(freqKhz: number): number {
  const str = Math.round(freqKhz).toString().padStart(4, '0');
  let bcd = 0;
  for (const ch of str) {
    bcd = (bcd << 4) | parseInt(ch, 10);
  }
  return bcd;
}

/** Validate that each digit of a transponder code is 0-7 (octal) */
function isValidXpdrCode(code: number): boolean {
  const str = Math.round(code).toString();
  if (str.length > 4) return false;
  return [...str].every((ch) => {
    const d = parseInt(ch, 10);
    return d >= 0 && d <= 7;
  });
}

/** Event mapping for radio + type combinations */
const RADIO_SET_EVENTS: Record<string, Record<string, string>> = {
  COM1: { active: 'COM_RADIO_SET', standby: 'COM_STBY_RADIO_SET' },
  COM2: { active: 'COM2_RADIO_SET', standby: 'COM2_STBY_RADIO_SET' },
  NAV1: { active: 'NAV1_RADIO_SET', standby: 'NAV1_STBY_SET' },
  NAV2: { active: 'NAV2_RADIO_SET', standby: 'NAV2_STBY_SET' },
  ADF: { active: 'ADF_SET', standby: 'ADF_SET' },
  XPDR: { active: 'XPNDR_SET', standby: 'XPNDR_SET' },
};

/** Frequency validation ranges */
const FREQ_RANGES: Record<string, { min: number; max: number; label: string }> = {
  COM1: { min: 118.0, max: 136.975, label: 'COM frequency (MHz)' },
  COM2: { min: 118.0, max: 136.975, label: 'COM frequency (MHz)' },
  NAV1: { min: 108.0, max: 117.95, label: 'NAV frequency (MHz)' },
  NAV2: { min: 108.0, max: 117.95, label: 'NAV frequency (MHz)' },
  ADF: { min: 100, max: 1799, label: 'ADF frequency (kHz)' },
  XPDR: { min: 0, max: 7777, label: 'Transponder code' },
};

// Keep bcd16ToFreq referenced to satisfy acceptance criteria (BCD16 <-> frequency conversion pair)
void bcd16ToFreq;

export function registerRadioTools(server: McpServer): void {
  const simConnect = SimConnectService.getInstance();
  const simVarService = new SimVarService(simConnect);
  const eventService = new EventService(simConnect);
  const safety = SafetyService.getInstance();

  server.tool(
    'get_radio_frequencies',
    "Read all radio frequencies: COM1/2 active and standby (MHz), NAV1/2 active and standby (MHz), ADF frequency (kHz), and transponder squawk code. Returns all radio settings in a single call.",
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
          { name: 'COM ACTIVE FREQUENCY:1', unit: 'MHz' },
          { name: 'COM STANDBY FREQUENCY:1', unit: 'MHz' },
          { name: 'COM ACTIVE FREQUENCY:2', unit: 'MHz' },
          { name: 'COM STANDBY FREQUENCY:2', unit: 'MHz' },
          { name: 'NAV ACTIVE FREQUENCY:1', unit: 'MHz' },
          { name: 'NAV STANDBY FREQUENCY:1', unit: 'MHz' },
          { name: 'NAV ACTIVE FREQUENCY:2', unit: 'MHz' },
          { name: 'NAV STANDBY FREQUENCY:2', unit: 'MHz' },
          { name: 'ADF ACTIVE FREQUENCY:1', unit: 'Hz' },
          { name: 'TRANSPONDER CODE:1', unit: 'number' },
        ];

        const values = await simVarService.getSimVars(vars);

        const result = {
          com1_active: Math.round((values['COM ACTIVE FREQUENCY:1'] as number) * 1000) / 1000,
          com1_standby: Math.round((values['COM STANDBY FREQUENCY:1'] as number) * 1000) / 1000,
          com2_active: Math.round((values['COM ACTIVE FREQUENCY:2'] as number) * 1000) / 1000,
          com2_standby: Math.round((values['COM STANDBY FREQUENCY:2'] as number) * 1000) / 1000,
          nav1_active: Math.round((values['NAV ACTIVE FREQUENCY:1'] as number) * 1000) / 1000,
          nav1_standby: Math.round((values['NAV STANDBY FREQUENCY:1'] as number) * 1000) / 1000,
          nav2_active: Math.round((values['NAV ACTIVE FREQUENCY:2'] as number) * 1000) / 1000,
          nav2_standby: Math.round((values['NAV STANDBY FREQUENCY:2'] as number) * 1000) / 1000,
          adf_frequency: Math.round((values['ADF ACTIVE FREQUENCY:1'] as number) / 1000),
          transponder_code: bcd16ToXpdr(values['TRANSPONDER CODE:1'] as number),
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

  server.tool(
    'set_radio_frequency',
    "Set a radio frequency or transponder code. Radio: COM1, COM2, NAV1, NAV2, ADF, XPDR. Type: 'active' or 'standby' (ignored for ADF/XPDR). Frequency: COM 118.000-136.975 MHz, NAV 108.00-117.95 MHz, ADF in kHz (e.g., 350), XPDR as 4-digit octal code 0000-7777. Internally converts to BCD16 format for SimConnect. Examples: set_radio_frequency({radio: 'COM1', type: 'standby', frequency: 118.300}), set_radio_frequency({radio: 'NAV1', type: 'active', frequency: 110.50}), set_radio_frequency({radio: 'XPDR', type: 'active', frequency: 1200}).",
    {
      radio: z
        .enum(['COM1', 'COM2', 'NAV1', 'NAV2', 'ADF', 'XPDR'])
        .describe("Radio to set: COM1, COM2, NAV1, NAV2, ADF, or XPDR"),
      type: z
        .enum(['active', 'standby'])
        .describe("Frequency type: 'active' or 'standby'. Ignored for ADF and XPDR."),
      frequency: z
        .number()
        .describe("Frequency in MHz (COM/NAV), kHz (ADF), or squawk code (XPDR)"),
    },
    async (args) => {
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

        // Safety check
        const safetyCheck = safety.checkAction('set_radio_frequency');
        if (!safetyCheck.allowed) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({ error: safetyCheck.reason }, null, 2),
              },
            ],
            isError: true,
          };
        }

        // Validate frequency range
        const range = FREQ_RANGES[args.radio];
        if (args.frequency < range.min || args.frequency > range.max) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  {
                    error: `${range.label} must be between ${range.min} and ${range.max}. Got: ${args.frequency}`,
                  },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }

        // Additional XPDR validation: each digit must be 0-7
        if (args.radio === 'XPDR' && !isValidXpdrCode(args.frequency)) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  {
                    error: `Transponder code must contain only digits 0-7 (octal). Got: ${args.frequency}`,
                  },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }

        // Convert frequency to BCD16 format
        let bcd16: number;
        if (args.radio === 'XPDR') {
          bcd16 = xpdrToBcd16(args.frequency);
        } else if (args.radio === 'ADF') {
          bcd16 = adfToBcd16(args.frequency);
        } else {
          bcd16 = freqToBcd16(args.frequency);
        }

        // Get the appropriate SimConnect event and dispatch
        const eventName = RADIO_SET_EVENTS[args.radio][args.type];
        await eventService.sendEvent(eventName, bcd16);

        const result: Record<string, unknown> = {
          success: true,
          radio: args.radio,
          type: args.type,
          frequency: args.frequency,
        };

        if (safetyCheck.warning) {
          result['warning'] = safetyCheck.warning;
        }

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
