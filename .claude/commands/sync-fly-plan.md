Sync the world map flight plan into the avionics:
1. Ensure SimConnect is connected (call `simconnect_connect` if needed)
2. Call `load_flight_plan` with no arguments (auto-resolves the MSFS 2024 CUSTOMFLIGHT.PLN via %APPDATA%)
3. Report success or error
