# Capability coaching model v1

Status: implemented, versioned and **provisional**. This replaces the rejected proposal for runtime use. The rejected document and Python script remain audit artifacts and are not imported by the app.

## Product decision: no shot-handicap labels

No empirical shot-by-handicap dataset has been supplied, and the available course data cannot justify labels such as “12-handicap shot”. The app therefore does not invent them.

The practical replacement separates two outputs:

1. **Factual shot assessment**, independent of target handicap: context, shot distance, radial progress, remaining distance, forward/stationary/backward direction, green-plane overshoot and route change.
2. **Coaching target success**, using the target Handicap Index only as a provisional difficulty setting. The target is stored before the shot and the endpoint is tested against that same target.

This preserves useful feedback without presenting calibration assumptions as evidence about playing ability.

## Inputs and contexts

Distances are WGS84 great-circle distances in yards.

Contexts are determined from the start state:

- `recovery` when the route is marked blocked;
- `tee-shot` for the first stroke event on a hole;
- `short-approach` for a clear non-tee shot starting within 60 yards;
- `fairway-shot` for other clear non-tee shots.

Tee shots use stated typical driver distance. All non-tee distance goals use stated longest reliable fairway distance. Neither value is inflated and no age/sex strength factor exists. Sex is used only for course scoring-profile selection.

## Target rules

Let `H = clamp(target Handicap Index, 0, 54)`.

The provisional coaching parameters are:

```
capabilityUtilisation = (92 - 0.5 * H) / 100
terminalRadiusYards = 8 + H * (22 / 54)
```

Thus the utilisation setting ranges from 92% at H0 to 65% at H54, and the terminal radius ranges from 8 to 30 yards. These are transparent coaching-difficulty assumptions, not measured handicap statistics.

For a clear-route shot:

```
capability = tee shot ? driver distance : reliable fairway distance

if startDistance <= capability:
    maximumEndDistance = min(startDistance, terminalRadiusYards)
else:
    requiredProgress = capability * capabilityUtilisation
    maximumEndDistance = startDistance - requiredProgress
```

This guarantees `requiredProgress <= capability`. If the green-centre tolerance is not reachable in one shot, the target is a capability-bounded lay-up.

For a recovery start, a Yes/No route flag cannot identify a safe line or defensible yardage. The target is therefore explicitly qualitative: restore a clear route. No precise recovery distance is invented. Target success requires `route_end = clear`.

For clear-route starts, target success requires both:

```
endDistance <= maximumEndDistance
route_end = clear
```

A shot ending blocked cannot be rewarded for distance alone. An accepted GPS fix worse than 23 metres is stored but excluded from target-success totals.

## Factual assessment

```
progress = startDistance - endDistance
```

- `progress > 2`: forward;
- `progress < -2`: backward;
- otherwise: stationary within a provisional two-yard GPS/noise tolerance.

Backwards progress always has one sign: negative. A backwards recovery can still meet its separate recovery target if it restores a clear route. A clear-route shot that becomes blocked records a worsened route and cannot meet its target.

The model also records actual endpoint-to-endpoint shot distance. It never reduces the entire result to raw distance gained and never converts a shot into a handicap band.

## Executed worked examples

The independent `npm run check:model` script executes these cases and grid invariants.

### Stated 150-yard driver

From 300 yards at H12:

- capability = 150 yards, unchanged;
- utilisation = 86%;
- required progress = 129 yards;
- target endpoint = 171 yards from centre.

### Previously impossible target

From 190 yards with a 120-yard driver at H12:

- capability = 120 yards;
- required progress = 103.2 yards;
- target endpoint = 86.8 yards;
- 103.2 is no greater than the 120-yard capability.

The rejected 142.2-yard demand is not reproduced.

### Poor 70-yard drive

From 220 to 150 yards:

- progress = 70 yards;
- the H12 goal is missed;
- no handicap label is generated.

### 25-yard short approach to centre

- context = short approach;
- progress = 25 yards;
- endpoint = 0 yards;
- target met;
- no handicap label is generated.

### Backwards recovery

From 60 to 80 yards while changing blocked to clear:

- progress = -20 yards;
- direction = backward;
- route change = improved;
- recovery target met.

This makes the distance fact and recovery outcome coexist without conflicting definitions.

## Independent invariant checks

`npm run check:model` checks 33,000 combinations across tee/fairway contexts, capabilities from 60–250 yards, starts from 10–600 yards and target handicaps 0–54. It asserts:

- no required progress exceeds the applicable capability;
- increasing target handicap never makes a distance goal stricter;
- factual shot fields do not change with target handicap;
- Stableford candidate points do not decrease as candidate handicap increases;
- every rejected-model failure listed above has an executable regression check.

## Stableford-style playing-level comparison

This is separate from shot assessment. It runs only for a complete supported sex/tee scoring profile.

Verified rules used:

- Course Handicap formula: `Handicap Index * (Slope / 113) + (Course Rating - par)`.
- For a 100% allowance, Playing Handicap is the Course Handicap rounded to the nearest whole number at the final step.
- Positive strokes follow ascending stroke index and repeat above 18; plus handicaps give strokes back starting at stroke index 18.
- Stableford compares gross strokes, including penalties, after handicap strokes to par; picked-up/no-score holes receive zero points.

After each hole is finished, the app shows two plain-language figures. The first is the Stableford points produced by the completed-hole scores when strokes are received at the player's target Handicap Index. The second compares candidate Handicap Index values from -5 through 54 with two net Stableford points per completed hole and displays the midpoint of the equally closest candidates as an approximate handicap indicated so far. Stableford's zero-point floor limits the effect of disastrous holes. Open-hole strokes are excluded, so neither figure changes shot by shot.

The single indicated value is a UI simplification of an often broad candidate range, especially early in a round. It is provisional, not an official Handicap Index, Score Differential or score for posting.

Authoritative sources checked 18 October 2026:

- USGA Rules of Handicapping, Rule 6.1a: https://www.usga.org/content/usga/home-page/handicapping/roh/Content/rules/6%201a%2018%20holes.htm
- USGA Rules of Handicapping, Rule 6.2a: https://www.usga.org/handicapping/roh/Content/rules/6%202a%20Standard%20Calculation.htm
- USGA Appendix E, Stroke Index Allocation: https://www.usga.org/handicapping/roh/Content/rules/Appendix%20E%20Stroke%20Index%20Allocation.htm
- R&A Rules of Golf, Rule 21.1 Stableford: https://www.randa.org/en/rog/the-rules-of-golf/rule-21

## Remaining limitations

- Coaching thresholds are not derived from a shot-level player dataset.
- Distance to mapped green centre is not distance to the pin and cannot reveal lie, elevation, wind, hazards or intended line.
- A binary route flag supports only a route-restoration goal, not a safe recovery waypoint.
- Radial progress and straight-line shot distance cannot fully judge a dogleg or deliberate lay-up.
- Tee coordinates and green centres retain all limitations in the supplied course README.
- The indicated handicap is a local completed-hole comparison, not a WHS Handicap Index calculation and not suitable for score submission.
