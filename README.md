<p align="center">
  <img src="banner.png" alt="SimConnect MCP Server" width="100%" />
</p>

<p align="center">
  MCP Server in TypeScript that exposes the SimConnect API of Microsoft Flight Simulator 2024 as MCP tools, resources, and prompts — enabling Claude to fully control the simulator.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-Windows-blue?style=flat-square" />
  <img src="https://img.shields.io/badge/MSFS-2024-0078D4?style=flat-square&logo=microsoft" />
  <img src="https://img.shields.io/badge/Node.js-18%2B-339933?style=flat-square&logo=node.js" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript" />
  <img src="https://img.shields.io/badge/MCP-compatible-blueviolet?style=flat-square" />
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" />
</p>

---

## Installation

### Step 1 — Install Node.js

Node.js 18 or higher is required. Download the **LTS** version from [nodejs.org](https://nodejs.org/).

After installation, close and reopen your terminal, then verify:

```bash
node -v   # should print v18.x.x or higher
npm -v    # should print 9.x.x or higher
```

### Step 2 — Clone and build

```bash
git clone https://github.com/jctommasi/simconnectmcp.git
cd simconnectmcp
npm install
npm run build
```

`npm install` downloads all dependencies, including **node-simconnect** (the Node.js bindings for the SimConnect SDK — no separate SDK download needed).

`npm run build` compiles TypeScript into the `dist/` folder.

### Step 3 — Verify Microsoft Flight Simulator 2024

MSFS 2024 must be installed on the same machine. The server communicates with the simulator through SimConnect named pipes, which are configured automatically by MSFS.

To confirm SimConnect is available, check that this file exists:

```
%APPDATA%\Microsoft Flight Simulator 2024\SimConnect.xml
```

This file is created by MSFS on first launch. If it doesn't exist, launch MSFS 2024 at least once before running the server.

> **Note:** The simulator must be running for the MCP server to connect. The server includes auto-reconnect with exponential backoff, so it will keep retrying if MSFS is not yet running.

### Step 4 — WASimCommander WASM module (optional)

WASimCommander is an open-source WASM module that exposes extended variable access inside MSFS. It is **not required** for basic operation — the server works fully without it. However, it unlocks these features for complex add-on aircraft (PMDG, FlyByWire, etc.):

| Feature | Description |
|---|---|
| `get_lvar` / `set_lvar` | Read/write L: (local) variables |
| `trigger_h_event` | Fire H: (HTML/gauge) events |
| `execute_calculator_code` | Execute RPN calculator code |

**Installing the WASM module:**

1. Download the latest release from the [WASimCommander GitHub releases page](https://github.com/mpaperno/WASimCommander/releases).
2. Inside the release zip, locate the folder named `wasimcommander-module` (or similar).
3. Copy that folder into your MSFS **Community** folder:
   ```
   %APPDATA%\Microsoft Flight Simulator 2024\Packages\Community\
   ```
4. Restart MSFS 2024. The WASM module loads automatically on startup.

> **Note:** There is currently no native Node.js client library for WASimCommander. The server detects and uses one via dynamic import (`wasim-client`) when available. Until then, WASimCommander tools return a descriptive error — the server starts and operates normally, these features degrade gracefully.

### Step 5 — Configure the server

A `simconnect-mcp.config.json` file is provided with defaults. Customize it as needed:

```json
{
  "safetyProfile": "safe",
  "logLevel": "info",
  "maxSubscriptions": 50,
  "reconnectMaxDelayMs": 30000
}
```

#### Safety Profiles

| Profile | Description |
|---|---|
| `unrestricted` | All operations allowed with no warnings |
| `safe` | All operations allowed; warnings on dangerous actions (set position, calculator code, L:vars, engine shutdown) |
| `readonly` | All write operations blocked; only read tools and resources work |

### Step 6 — Claude Desktop integration

Add the server to your Claude Desktop configuration file:

- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "simconnect-msfs2024": {
      "command": "node",
      "args": ["C:/Users/YOUR_USER/path/to/simconnect-mcp-server/dist/index.js"]
    }
  }
}
```

See `claude_desktop_config.example.json` for a complete template.

### Quick verification

```bash
# 1. Build succeeded
ls dist/index.js        # should exist

# 2. Start in dev mode (MSFS must be running)
npm run dev

# 3. You should see log output on stderr indicating:
#    - MCP server started
#    - SimConnect attempting connection (or connected if MSFS is running)
#    - WASimCommander status (available or gracefully disabled)
```

Press `Ctrl+C` to stop the dev server.

---

## Usage

```bash
# Development (with hot reload)
npm run dev

# Production
npm run build
npm start

# Or run directly via bin
npx simconnect-mcp-server
```

---

## Claude Code Slash Commands

When using this project with [Claude Code](https://claude.ai/code), the following slash commands are available:

### Flight Plan

| Command | Description |
|---|---|
| `/sync-fly-plan` | Sync the world map flight plan into the avionics |

`/sync-fly-plan` ensures SimConnect is connected, then calls `load_flight_plan` with no arguments — it auto-resolves the MSFS 2024 `CUSTOMFLIGHT.PLN` via `%APPDATA%`.

### Time Acceleration

| Command | Description |
|---|---|
| `/x1` | Set sim rate to 1× |
| `/x8` | Set sim rate to 8× |
| `/x16` | Set sim rate to 16× |
| `/x32` | Set sim rate to 32× |
| `/x64` | Set sim rate to 64× |

### Autonomous Phase Management

| Command | Description |
|---|---|
| `/crusader` | Fast-forward at 64× until cruise altitude is reached, then hold |
| `/go-to-dest` | Fast-forward at 64× until ~10 min from destination, then drop to 1× |

**`/crusader`** — Sets sim rate to 64×, then monitors `GPS ETE` and `PLANE ALTITUDE` periodically. When the aircraft stabilizes at cruise altitude (vertical speed near 0 for 2+ consecutive checks), it reports "Cruise phase reached" and keeps 64× running until told otherwise.

**`/go-to-dest`** — Sets sim rate to 64×, then monitors `GPS ETE` every ~30 seconds (real time). When ETE drops below 600 seconds, it drops to 1× and reports: *"Approaching destination — sim rate 1×. Ready for traffic pattern entry."*

---

## Available Tools

### Connection & Safety

| Tool | Description |
|---|---|
| `simconnect_connect` | Connect to the simulator via SimConnect |
| `simconnect_disconnect` | Disconnect from the simulator |
| `get_safety_profile` | Get the active safety profile and its restrictions |

### SimVar Access

| Tool | Description |
|---|---|
| `get_simvar` | Read one or more simulation variables by name and unit |
| `set_simvar` | Write a simulation variable value |
| `subscribe_simvar` | Subscribe to SimVar changes for continuous monitoring |
| `unsubscribe_simvar` | Cancel an active SimVar subscription |

### Events

| Tool | Description |
|---|---|
| `send_event` | Fire any Key Event by name (e.g., `PARKING_BRAKES`, `GEAR_TOGGLE`) |

### Aircraft Position

| Tool | Description |
|---|---|
| `get_aircraft_position` | Read full aircraft position (lat, lon, alt, heading, speeds, attitude) |
| `set_aircraft_position` | Teleport aircraft to a new location via slew mode |

### Engine Control

| Tool | Description |
|---|---|
| `get_engine_data` | Read per-engine parameters (RPM, N1/N2, EGT, fuel flow, oil, throttle) |
| `control_engine` | Set throttle, mixture, or prop pitch for individual or all engines |

### Autopilot

| Tool | Description |
|---|---|
| `get_autopilot_state` | Read full autopilot state (master, heading, altitude, VS, modes) |
| `set_autopilot` | Engage/disengage AP, set heading, altitude, VS, speed, toggle modes |

### Radio & Navigation

| Tool | Description |
|---|---|
| `get_radio_frequencies` | Read COM1/2, NAV1/2, ADF, and transponder frequencies |
| `set_radio_frequency` | Set any radio frequency with automatic BCD16 conversion |

### Flight Plan

| Tool | Description |
|---|---|
| `get_flight_plan` | Retrieve GPS flight plan with waypoints, progress, and ETE |
| `load_flight_plan` | Load a `.pln` flight plan file into the simulator |

### Aircraft Systems

| Tool | Description |
|---|---|
| `control_lights` | Control individual or all aircraft lights (on/off/toggle) |
| `control_landing_gear` | Raise/lower gear and control parking brake |
| `control_flaps` | Increase/decrease/set flap position |
| `get_weather` | Read ambient weather (temperature, wind, visibility, barometer) |
| `get_systems_status` | Read electrical, hydraulic, pressurization, and anti-ice status |
| `get_fuel_payload` | Read fuel quantities, weight, CG, and estimated endurance |

### Simulation Control

| Tool | Description |
|---|---|
| `control_sim_rate` | Increase/decrease/set simulation speed |
| `pause_sim` | Pause, unpause, or toggle simulator pause state |

### WASimCommander (Extended Access)

| Tool | Description |
|---|---|
| `get_lvar` | Read an L: (local) variable — for complex aircraft |
| `set_lvar` | Write an L: variable |
| `trigger_h_event` | Fire an H: (HTML) event |
| `execute_calculator_code` | Execute RPN calculator code and return the result |

---

## Resources

| URI | Description |
|---|---|
| `simconnect://catalog/simvars` | Full catalog of available SimVars grouped by category |
| `simconnect://catalog/events` | Full catalog of Key Events grouped by category |
| `simconnect://aircraft/info` | Current aircraft title, type, model, and engine info |
| `simconnect://status` | Connection status, uptime, safety profile, and subscription count |

---

## Prompts

| Prompt | Description |
|---|---|
| `flight_briefing` | Guides Claude through a complete pilot-style flight briefing |
| `pre_flight_checklist` | Step-by-step pre-flight verification checklist |
| `approach_setup` | Configure an ILS, RNAV, or VOR approach |
| `emergency_procedures` | Handle engine failure, electrical failure, pressurization, or fire emergencies |

---

## License

MIT
