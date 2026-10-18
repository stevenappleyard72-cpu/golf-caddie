# Replacement benchmark model (provisional)

Status: **REJECTED / UNAPPROVED.** Retained only as design-review evidence. It is disconnected from the runtime app. Its approved replacement is documented in `docs/capability-coaching-model.md`.

## 1. Design principles

This replacement model is rejected if it does any of the following:

- inflates a player's measured ability by dressing up a drive distance as a larger "capability"
- treats all shots as the same weighted gain multiplied by a player constant
- splits assessment and next-target logic into incompatible rules
- invents a precise safe-recovery target from a Yes/No route flag
- presents a score estimate without checking actual course profile, stroke index and gross-hole scoring

The model must satisfy four requirements:

1. Respect the actual measured distance capability supplied by the player.
2. Assess the result against an expected outcome from the starting position and route state.
3. Derive the next-shot target and the target-success decision from the same benchmark rules.
4. Keep all calibration provisional and separate from official WHS calculations.

## 2. Inputs and distance rules

Use geodesic WGS84 distance in yards. For each shot, compute:

- `d_start`: remaining distance to green centre at the start of the shot
- `d_end`: remaining distance to green centre at the endpoint of the shot
- `gain = max(0, d_start - d_end)`
- `delta = d_end - d_start`
- `progress = max(0, d_start - d_end)`
- `route_start`: route condition at shot start, `true` = clear route, `false` = blocked/recovery
- `route_end`: route condition at shot end, `true` = clear route, `false` = blocked/recovery

The definition of a backwards shot is explicit:

- a shot is backwards when `delta > 0`
- there is no hidden rule that converts backwards movement into a valid gain
- a backwards shot is a poor result and must be treated as such

This avoids the previous conflict where the model treated a backwards shot as if the sign was ambiguous.

## 3. Capability limits (no inflation)

The model uses the player's measured distances directly and never turns them into a larger capability number.

- `driverCapability = min(D, 250)`
- `fairwayCapability = min(F, 200)`
- `shortGameCapability = min(F * 0.4, 35)`

This is intentionally conservative. If the player says 150 yards, the model does not silently treat 150 as 180. A 180-yard capability requires the player to state 180 yards.

## 4. Context benchmark: expected outcome from the starting position

The benchmark is the expected end distance from the starting position, not a generic gain multiplier. The same context logic is used to assess the actual result and to set the next-shot target.

### 4.1 Shot stages

Use a start-position stage:

- `long-shot` if `d_start > 170`
- `approach` if `30 < d_start <= 170`
- `short-game` if `d_start <= 30`

### 4.2 Expected end distance by stage

For a clear route:

```
if stage == "long-shot":
    expected_end = max(0, d_start - min(0.60 * driverCapability, 150))
elif stage == "approach":
    expected_end = max(0, d_start - min(0.55 * fairwayCapability, 80))
else:
    expected_end = max(0, d_start - min(0.70 * shortGameCapability, 25))
```

For a blocked or recovery route:

```
if stage == "long-shot":
    expected_end = max(0, d_start - min(0.40 * driverCapability, 90))
elif stage == "approach":
    expected_end = max(0, d_start - min(0.35 * fairwayCapability, 55))
else:
    expected_end = max(0, d_start - min(0.45 * shortGameCapability, 18))
```

This is a benchmark expectation derived from the actual start state and route condition. It is not a generic distance gain formula and it does not claim to be a statistically measured curve.

### 4.3 Route effect at the end of the shot

The starting route state and the ending route state are kept separate.

```
routePenalty = 0
if route_start == true and route_end == false:
    routePenalty = 10
elif route_start == false and route_end == true:
    routePenalty = -8
```

This is deliberately small and only records that the route changed. It is not a precise safe-recovery model and it does not claim to know how much the recovery cost should be. The app should not invent a safe target from a Yes/No flag alone.

## 5. Shot assessment and handicap bands

Define:

- `expectedProgress = max(0, d_start - expected_end)`
- `actualProgress = max(0, d_start - d_end)`
- `deviation = actualProgress - expectedProgress + routePenalty`

Then assign the band from the actual endpoint against the expected outcome:

```
if deviation >= 15:
    band = "Band 12"
elif deviation >= 0:
    band = "Band 18"
elif deviation >= -10:
    band = "Band 24"
elif deviation >= -25:
    band = "Band 30"
else:
    band = "Band 36+"
```

This is a benchmark from the starting position. It varies by stage and route, not by a single gain multiplier. A long drive, a fairway approach and a short wedge are no longer treated as if they were all the same type of shot.

### 5.1 Worked examples from the revision

#### Example A: 150-yard driver capability

Assume:

- `D = 150`
- `driverCapability = min(150, 250) = 150`

This is the correct capability under the new rule. The player is not rewarded as if they hit 180 yards.

#### Example B: poor 70-yard drive from 220 yards

Assume:

- `D = 240`
- `driverCapability = min(240, 250) = 240`
- `d_start = 220`
- `d_end = 150`
- `route_start = true`
- `route_end = true`

Expected clear-route long-shot outcome:

`expected_end = 220 - min(0.60 * 240, 150) = 220 - 144 = 76`

Expected progress:

`expectedProgress = 220 - 76 = 144`

Actual progress:

`actualProgress = 220 - 150 = 70`

Deviation:

`deviation = 70 - 144 = -74`

Band:

`Band 36+`

This is the correct behaviour. A 70-yard drive does not become a Band 12 shot just because the player hit a long drive last year.

#### Example C: 25-yard short approach to green centre

Assume:

- `d_start = 25`
- `d_end = 0`
- `route_start = true`
- `route_end = true`
- `F = 180`
- `shortGameCapability = min(180 * 0.4, 35) = 35`

Expected clear-route short-game outcome:

`expected_end = 25 - min(0.70 * 35, 25) = 25 - 24.5 = 0.5`

Expected progress:

`expectedProgress = 25 - 0.5 = 24.5`

Actual progress:

`actualProgress = 25 - 0 = 25`

Deviation:

`deviation = 25 - 24.5 = 0.5`

Band:

`Band 18`

This is a strong short-game outcome; it is not a Band 30 failure simply because the shot started from 25 yards.

#### Example D: backwards shot

Assume:

- `d_start = 60`
- `d_end = 80`
- `delta = 80 - 60 = +20`
- `gain = 0`

A shot that moves away from the green is not treated as a valid gain. It falls into the weak/poor categories in the same way as a lost ball or a backward move. The previous ambiguous definition is removed.

#### Example E: blocked route and recovery

Assume:

- `d_start = 110`
- `d_end = 60`
- `route_start = false`
- `route_end = false`
- `F = 180`
- `fairwayCapability = min(180, 200) = 180`

Expected blocked-route approach outcome:

`expected_end = 110 - min(0.35 * 180, 55) = 110 - 55 = 55`

Expected progress:

`expectedProgress = 110 - 55 = 55`

Actual progress:

`actualProgress = 110 - 60 = 50`

Deviation:

`deviation = 50 - 55 = -5`

Band:

`Band 24`

The route is blocked and the benchmark is deliberately narrower. The model does not invent a precise safe side-lying target from the Yes/No flag.

## 6. Next-shot target and target-success rule

The target and the success check are produced from the same benchmark logic and cannot contradict each other.

### 6.1 Target objective

Let:

- `H = target handicap index`
- `handicapGoal = clamp(1.9 * H + 25, 20, 120)`
- `handicapBuffer = max(0, H - 12) * 0.85`

Then compute the benchmark target from the current start position:

```
if stage == "long-shot":
    benchmarkTarget = expected_end + 15 + handicapBuffer
elif stage == "approach":
    benchmarkTarget = expected_end + 12 + handicapBuffer
else:
    benchmarkTarget = expected_end + 8 + handicapBuffer
```

Then apply the reachable target cap:

```
nextTarget = min(d_start, max(15, benchmarkTarget), handicapGoal)
```

This means:

- the target is always reachable from the current ball position
- higher handicap settings still produce a more forgiving target
- the target remains tied to the same start-position benchmark used in shot assessment
- no recovery flag produces a precise safe target number; it only broadens the target objective conservatively

### 6.2 Target success

The player meets the shot target if the actual distance to green after the shot is at or inside the target:

```
targetMet = (d_end <= nextTarget)
```

This uses the same benchmark rules. It is not a separate target model disguised as an outcome model.

### 6.3 Worked target examples

#### Example F: H12 vs H24 from the same distance

Assume:

- `d_start = 140`
- `route_start = true`
- `F = 120`
- `fairwayCapability = min(120, 200) = 120`
- `expected_end = 140 - min(0.55 * 120, 80) = 140 - 66 = 74`

For H12:

- `handicapGoal = 1.9 * 12 + 25 = 47.8`
- `handicapBuffer = 0`
- `benchmarkTarget = 74 + 12 + 0 = 86`
- `nextTarget = min(140, max(15, 86), 47.8) = 47.8`

For H24:

- `handicapGoal = 1.9 * 24 + 25 = 70.6`
- `handicapBuffer = (24 - 12) * 0.85 = 10.2`
- `benchmarkTarget = 74 + 12 + 10.2 = 96.2`
- `nextTarget = min(140, max(15, 96.2), 70.6) = 70.6`

The targets differ by handicap, but both come from the same expected-outcome benchmark and the same route/position logic.

#### Example G: 190-yard position with a 150-yard driver

Assume:

- `d_start = 190`
- `route_start = true`
- `D = 150`
- `driverCapability = 150`
- `expected_end = 190 - min(0.60 * 150, 150) = 190 - 90 = 100`
- `handicapGoal = 1.9*12 + 25 = 47.8`
- `benchmarkTarget = 100 + 15 = 115`
- `nextTarget = min(190, max(15, 115), 47.8) = 47.8`

This is reachable and is not a fake “go for the green” target that requires 142 yards of progress.

## 7. Overall playing estimate: official WHS rules, not a hidden score model

The overall estimate must be tied to actual scoring rules and actual course data. The model does not hide behind a hand-wavy gain ratio.

### 7.1 WHS formula used for a course handicap

The authoritative formula is:

`Course Handicap = Handicap Index * Slope / 113 + (Course Rating - Par)`

For a round with a specific course and tee, the course handicap is used to determine how many strokes a player receives on each hole based on the stroke index.

### 7.2 Strokes received from a course handicap

For a course handicap `CH` and a hole with stroke index `SI`:

```
if CH < 18:
    strokesReceived = 1 if SI <= CH else 0
else:
    base = floor(CH / 18)
    remainder = CH - base * 18
    strokesReceived = base + 1 if SI <= remainder else base
```

This matches the standard WHS allocation used by official scorecards.

### 7.3 Stableford points from gross score and strokes received

For each hole:

`netStrokes = grossScore - strokesReceived`
`points = max(0, 2 + par - netStrokes)`

This is the correct net Stableford formula. It is used for the comparative candidate estimate, not a hidden curve.

### 7.4 Candidate comparison table

Example course profile:

- `Par = 72`
- `Course Rating = 71.1`
- `Slope = 122`

Sample hole set:

| Hole | Par | SI | Gross score |
|---|---:|---:|---:|
| 1 | 4 | 5 | 5 |
| 2 | 4 | 9 | 4 |
| 3 | 5 | 12 | 6 |
| 4 | 3 | 2 | 3 |
| 5 | 4 | 17 | 6 |
| 6 | 4 | 11 | 7 |

Candidate levels and course handicaps:

| Candidate | Handicap Index | Course Handicap |
|---|---:|---:|
| A | 12 | 12.1 |
| B | 16 | 16.4 |
| C | 20 | 20.7 |
| D | 24 | 25.0 |

Using the stroke-index allocation:

| Candidate | Course Hcp | Total Stableford points |
|---|---:|---:|
| A | 12.1 | 10 |
| B | 16.4 | 10 |
| C | 20.7 | 12 |
| D | 25.0 | 13 |

This demonstrates the actual comparison: a higher course handicap receives more strokes, and the same gross scores produce more net Stableford points. The model compares candidates by actual score output, not by a fabricated shot-gain constant.

### 7.5 Why the previous conversion was wrong

The previous draft used an incorrect “course handicap” approximation that effectively treated the score estimate as a direct stroke conversion without checking the official formula against the course rating and slope. The correct formula is:

`Course Handicap = Handicap Index * Slope / 113 + (Course Rating - Par)`

It must be applied before hole-by-hole strokes received are allocated.

## 8. Calibration status

All benchmark thresholds remain provisional:

- `Band 12`, `Band 18`, `Band 24`, `Band 30`, `Band 36+`
- `handicapGoal = 1.9 * H + 25`
- `card values` used to convert start-state expectations into expected end distances
- `routePenalty` values
- any final score estimate drawn from candidate comparison tables

These are local, reviewable tuning values. They are not official handicap calculations and they should never be described as measured golf statistics.

## 9. Review note

This replacement model is intentionally stricter than the previous draft. It removes the hidden inflation of player capability, separates stage-specific context from generic gain, keeps start and end route states distinct, and ties the next target and the shot assessment to the same benchmarking logic.

It is still provisional and deliberately simple. It is designed to be reviewable and implementation-safe before any app logic is embedded.
