# SimConnect MCP Server - Development Guidelines

## Portable Paths

All file paths in the codebase MUST be environment and user agnostic. Never hardcode user-specific paths (e.g., `C:\Users\$USER\...`). Instead, resolve paths dynamically using environment variables (`APPDATA`, `LOCALAPPDATA`, `USERPROFILE`, etc.) or `os.homedir()` so the code works for any user on any machine.

## Flight Commands

These are shortcut commands for common flight operations. Execute them immediately when the user types them.

### /sync-fly-plan
Sync the world map flight plan into the avionics:
1. Ensure SimConnect is connected (call `simconnect_connect` if needed)
2. Call `load_flight_plan` with no arguments (auto-resolves the MSFS 2024 CUSTOMFLIGHT.PLN via %APPDATA%)
3. Report success or error

### /crusader
Fast-forward to cruise phase at x64:
1. Set sim rate to 64 via `control_sim_rate({action: 'set', target_rate: 64})`
2. Monitor `GPS ETE` and `PLANE ALTITUDE` periodically
3. When the aircraft reaches and stabilizes at cruise altitude (vertical speed near 0 and altitude stable for 2+ checks), report "Cruise phase reached" and keep x64 running
4. The user will tell you when to slow down

### /x1
Set sim rate to 1x: `control_sim_rate({action: 'set', target_rate: 1})`

### /x2
Set sim rate to 2x: `control_sim_rate({action: 'set', target_rate: 2})`

### /x4
Set sim rate to 4x: `control_sim_rate({action: 'set', target_rate: 4})`

### /x8
Set sim rate to 8x: `control_sim_rate({action: 'set', target_rate: 8})`

### /x16
Set sim rate to 16x: `control_sim_rate({action: 'set', target_rate: 16})`

### /x32
Set sim rate to 32x: `control_sim_rate({action: 'set', target_rate: 32})`

### /x64
Set sim rate to 64x: `control_sim_rate({action: 'set', target_rate: 64})`

### /x128
Set sim rate to 128x: `control_sim_rate({action: 'set', target_rate: 128})`

### /go-to-dest
Fast-forward at x64 until reaching the destination airport traffic pattern:
1. Set sim rate to 64 via `control_sim_rate({action: 'set', target_rate: 64})`
2. Monitor `GPS ETE` periodically (not too frequently — every ~30 seconds real time)
3. When `GPS ETE` drops below 600 seconds (~10 min sim time to destination), set sim rate to 1x
4. Report "Approaching destination — sim rate 1x. Ready for traffic pattern entry."
