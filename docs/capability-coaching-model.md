# Expected-distance coaching model v1

Status: implemented and versioned as `expected-distance-lookup-v1`.

## Product decision

The coaching target is determined by exactly two inputs:

- the ball's current straight-line distance from the mapped green centre; and
- the player's target Handicap Index.

Age, sex, typical driver distance and longest reliable fairway distance are not inputs. Route state and whether the shot is a tee shot remain factual context, but they do not change the expected finishing distance or the target-success decision.

## Lookup source

The supplied table in `docs/golf_expected_distance_lookup.csv` is the source for expected finishing distances. It contains target Handicap Index rows 0–36 and starting-distance columns from 10 to 300 yards in 10-yard steps.

Runtime data is stored in `src/expectedDistanceLookup.js`. An automated test compares every runtime value with the CSV so the build fails if the two copies diverge.

## Lookup rules

For an exact row and column, the model returns the table value unchanged. For example, a shot starting 100 yards from the green at target Handicap Index 12 has an expected finishing distance of 17.7 yards.

For values between cells:

- starting distance is linearly interpolated between the adjacent 10-yard columns;
- decimal target handicaps are linearly interpolated between adjacent handicap rows.

Boundary behaviour is explicit:

- from 0–10 yards, the result is linearly interpolated from `(0, 0)` to the 10-yard table cell;
- beyond 300 yards, the expected progress at 300 yards is held constant, so each yard added to the start is also added to the expected finish;
- target handicaps below 0 use the H0 row;
- target handicaps above 36 use the H36 row.

This preserves the supplied lookup values without inventing capability inputs or requiring an unrealistic finish near the green from starting distances beyond the table.

## Target and assessment

Before each shot, the app stores:

- start distance;
- target Handicap Index;
- expected finishing distance from the lookup;
- required progress (`start distance - expected finishing distance`);
- model version and lookup source.

A sufficiently accurate endpoint meets the target when:

`actual finishing distance <= expected finishing distance`

Route state does not alter that comparison. Route changes, shot distance, radial progress, direction and green-plane overshoot remain available as factual feedback.

An accepted GPS fix worse than 23 metres is stored but excluded from target-success totals.

## Stableford and indicative handicap

Stableford is separate from the shot-distance lookup. The player selects a tee colour rather than a sex:

- yellow tees use the verified yellow-tee rating and hole-scoring profile;
- red tees use the verified red-tee rating and hole-scoring profile.

The underlying supplied course data still records the provenance of each rating, but sex is not a player input and is not used to select between profiles after tee colour is chosen. White is retained only for compatibility with previously saved rounds and is not offered for new rounds for now.

Course Handicap, stroke allocation, Stableford points and the provisional indicative handicap continue to use the selected tee's verified course rating, slope, par and per-hole stroke index.

## Saved-round compatibility

Older profiles remain importable. Age, sex and capability-distance fields are discarded during validation. Historical shot assessments retain their stored model version and values; new shots use `expected-distance-lookup-v1`.

## Limitations

- The lookup describes expected finishing distance from the green centre, not distance to the pin.
- It does not account for lie, elevation, wind, hazards, doglegs or intended line.
- The H0 and H36 rows are used outside the table's handicap range rather than extrapolating unsupported values.
- Tee coordinates and green centres retain all limitations in the supplied course README.
- The indicative handicap is a local completed-hole comparison, not an official WHS Handicap Index or score for posting.
