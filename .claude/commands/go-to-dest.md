Fast-forward at x64 until reaching the destination airport traffic pattern:
1. Set sim rate to 64 via `control_sim_rate({action: 'set', target_rate: 64})`
2. Monitor `GPS ETE` periodically (not too frequently — every ~30 seconds real time)
3. When `GPS ETE` drops below 600 seconds (~10 min sim time to destination), set sim rate to 1x
4. Report "Approaching destination — sim rate 1x. Ready for traffic pattern entry."
