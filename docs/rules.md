> Legacy v1 / local exhibition reference. Requires explicit `ARENA_MODE=legacy`. For the current read-only v2 viewer, see [the v2 guide](protocol-v2.md).

# Combat rules and balance

Every champion begins with 100 vitality and 6 stamina. Both actions are chosen from the same pre-exchange state, then resolved simultaneously. There are at most 24 exchanges, normally one per second. Headless Practice runs the same engine immediately.

## Revision 2

| Action  | Stamina    | Effect                                        |
| ------- | ---------- | --------------------------------------------- |
| Strike  | Costs 2    | 12 damage, reduced to 3 against Guard         |
| Feint   | Costs 3    | 6 damage, increased to 10 against Guard       |
| Guard   | Restores 1 | Reduces a Strike and counters it for 6 damage |
| Recover | Restores 3 | No attack; exposed to the opponent            |

Stamina is capped at 6. A champion below its Recovery threshold recovers proactively. Otherwise Aggression maps to a 25–75% attack chance; the alternative is Guard. Feint frequency decides the attack type when there is at least 3 stamina. An attempted attack with less than 2 stamina forces recovery.

The higher remaining vitality wins at knockout or the exchange cap. An exact tie compares damage dealt, then uses a stored seeded tie-break. Simultaneous knockouts are possible. There is exactly one winner.

BattleBots owns XP, prizes, competitive records and Ranked rating. Vitality, stamina and the engine's random seed are game state, not platform progression.

## Why the Guard counter exists

The first prototype's unpunished strikes made maximum aggression dominate the preset sweep. Revision 2 adds the counter, producing a clear cycle: direct pressure beats feints, feints beat a patient guard, and a patient guard punishes predictable strikes.

Reproduce with `npm run balance`. The script uses 500 seeds in both seats, or 1,000 duels per cell:

| Preset win rate | Pressure | Feints | Patient | Balanced | Recovery |
| --------------- | -------: | -----: | ------: | -------: | -------: |
| Pressure        |    50.0% |  85.3% |    4.3% |    31.3% |    64.7% |
| Feints          |    14.7% |  50.0% |   95.2% |    51.3% |    64.6% |
| Patient         |    95.7% |   4.8% |   50.0% |    61.8% |    39.1% |
| Balanced        |    68.7% |  48.7% |   38.2% |    50.0% |    60.7% |
| Recovery        |    35.3% |  35.4% |   60.9% |    39.3% |    50.0% |

This is a regression tool for these presets, not proof of full-game balance. Wider strategy optimization should precede serious competitive stakes.

Matches pin their rules revision at creation. Revision 1 has no Guard counter and remains executable for old persisted fights. Replays always use recorded events, including their original captions and timestamps; they never reroll the match.
