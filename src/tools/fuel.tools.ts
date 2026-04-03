import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SimConnectService } from '../services/simconnect.service.js';
import { SimVarService } from '../services/simvar.service.js';

export function registerFuelTools(server: McpServer): void {
  const simConnect = SimConnectService.getInstance();
  const simVarService = new SimVarService(simConnect);

  server.tool(
    'get_fuel_payload',
    "Read fuel and payload data: total fuel (gallons and pounds), total fuel flow (GPH), estimated endurance (hours, null if engines off), empty weight, total weight, and center of gravity position (percent MAC). Read-only tool.",
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
          { name: 'FUEL TOTAL QUANTITY', unit: 'gallons' },
          { name: 'FUEL TOTAL QUANTITY WEIGHT', unit: 'pounds' },
          { name: 'ENG FUEL FLOW GPH:1', unit: 'gallons per hour' },
          { name: 'EMPTY WEIGHT', unit: 'pounds' },
          { name: 'TOTAL WEIGHT', unit: 'pounds' },
          { name: 'CG PERCENT', unit: 'percent' },
        ];

        const values = await simVarService.getSimVars(vars);

        // Read fuel flow from all engines to calculate total
        let numEngines = 1;
        try {
          const engCount = await simVarService.getSimVar('NUMBER OF ENGINES', 'number');
          numEngines = Math.round(engCount as number);
        } catch {
          // Default to 1 engine
        }

        let totalFuelFlow = 0;
        if (numEngines <= 1) {
          totalFuelFlow = values['ENG FUEL FLOW GPH:1'] as number;
        } else {
          // Read fuel flow from each engine
          const flowVars = [];
          for (let i = 1; i <= numEngines; i++) {
            flowVars.push({ name: `ENG FUEL FLOW GPH:${i}`, unit: 'gallons per hour' });
          }
          const flows = await simVarService.getSimVars(flowVars);
          for (let i = 1; i <= numEngines; i++) {
            totalFuelFlow += flows[`ENG FUEL FLOW GPH:${i}`] as number;
          }
        }

        const fuelTotalGallons = values['FUEL TOTAL QUANTITY'] as number;
        const estimatedEndurance =
          totalFuelFlow > 0 ? Math.round((fuelTotalGallons / totalFuelFlow) * 10) / 10 : null;

        const result = {
          fuel_total_gallons: Math.round(fuelTotalGallons * 10) / 10,
          fuel_total_lbs: Math.round(values['FUEL TOTAL QUANTITY WEIGHT'] as number),
          fuel_flow_total_gph: Math.round(totalFuelFlow * 10) / 10,
          estimated_endurance_hrs: estimatedEndurance,
          empty_weight_lbs: Math.round(values['EMPTY WEIGHT'] as number),
          total_weight_lbs: Math.round(values['TOTAL WEIGHT'] as number),
          cg_position_pct: Math.round((values['CG PERCENT'] as number) * 10) / 10,
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
}
