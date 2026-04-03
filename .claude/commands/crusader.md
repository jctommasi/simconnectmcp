Fast-forward to cruise phase at x64:
1. Set sim rate to 64 via `control_sim_rate({action: 'set', target_rate: 64})`
2. Monitor `GPS ETE` and `PLANE ALTITUDE` periodically
3. When the aircraft reaches and stabilizes at cruise altitude (vertical speed near 0 and altitude stable for 2+ checks), report "Cruise phase reached" and keep x64 running
4. The user will tell you when to slow down
