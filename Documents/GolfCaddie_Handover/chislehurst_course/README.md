# Chislehurst Golf Club — prototype course data

Prepared 18 October 2026. WGS84 decimal degrees. Distances in yards unless marked metres.

## What was obtained

- 18 numbered OpenStreetMap golf-hole lines, with pars and stroke indexes matching the men's published hole order.
- 18 unique playing greens matched by containment: each numbered hole line ends inside its assigned green polygon.
- 18 mapped reference tee points: every hole-line start lies inside a mapped tee polygon.
- 44 mapped tee polygons and 20 green polygons overall. The two extra green polygons are NOT assigned to playing holes.
- Official website overview scorecard for white, yellow and red tees.
- Club-linked men's white and yellow ratings and women's yellow and red ratings.

## Essential distinction: mapped positions vs tee-colour estimates

The greenCentre entries are calculated polygon centroids, not surveyed pins or independently verified current green centres. Every centroid was checked to be inside its matched mapped green.

The mappedReferenceTee entries are real mapped hole-line start coordinates. THE SOURCE DOES NOT SAY WHICH TEE COLOUR THEY REPRESENT.

The teeSets[].holes[].tee entries are PROVISIONAL colour-specific estimates, NOT verified white/yellow/red tee markers. All have teeStatus = inferred_colour_not_verified. They are supplied for prototype experimentation, not as survey-quality measurements.

Estimation method: assume the mapped start is a white reference; move forwards along the mapped hole line by the published white-minus-selected-colour yardage; constrain the result to a nearby mapped tee polygon in the forward corridor. Some colours share the same mapped tee area and can overlap. This method can be wrong where the initial white-reference assumption, tee direction or published scorecard is wrong. Snapping distance is NOT an accuracy bound. Seven decimal places preserve computation; they do not imply centimetre accuracy.

Use the greenCentres for ball-to-green distance. Keep tee coordinates configurable so a confirmed coordinate replaces an estimate without changing any app code. If an estimate seems incorrect, use the mappedReferenceTee as an explicitly generic fallback, or correct it on the map. Do not silently present either as a confirmed colour-specific marker.

The source hole lines were last edited in 2020 and tee/green polygons in 2021. Fetching them in 2026 does not establish that they were surveyed or updated in 2026. Field-check the dataset during an initial practice walk/round.

## Files

- chislehurst-course.json — app data, scorecard, provisional coloured tees, green centres, source references, quality flags and limitations.
- chislehurst-coordinates.csv — 54 rows: one row per playing hole and requested tee colour. Tee positions are provisional.
- chislehurst-map-geometry.geojson — mapped tee/green polygons and numbered hole lines; can be opened in GIS tools.
- chislehurst-coordinate-map.png — overview with all 18 numbered greens and mapped reference tees.
- chislehurst-provisional-tee-detail.png — close-up panels for checking estimated tee colours; these are NOT a verification of their colours.
- chislehurst-source.osm — scoped original OSM nodes and ways used for reproducibility.
- rebuild_course.py — rebuilds JSON, CSV, GeoJSON and maps from the scoped OSM extract. Requires Python and matplotlib. Run from any directory using python /path/to/rebuild_course.py.

## Scoring limitations

The club-linked rating pages confirm:

| Tees | Sex | Course rating | Slope | Total par |
|---|---|---:|---:|---:|
| White | Male | 65.5 | 124 | 66 |
| Yellow | Male | 64.7 | 120 | 66 |
| Yellow | Female | 70.1 | 132 | 69 |
| Red | Female | 68.9 | 129 | 69 |

The yellow and white hole scoring arrays are the men's colour columns. The red hole scoring array is the women's colour column. These must not automatically be reused across sexes. In particular, female yellow total par is 69, not the 66 in the male hole array. Its female per-hole par/SI remains unconfirmed. Male red rating 64.0/118 is only from a secondary directory and was NOT listed on the club-linked men's rating page. Female white rating is not established. Disable unsupported Stableford combinations until their scoring profiles are confirmed; distances can still be used.

The official overview card currently totals white 5,117 yards, yellow 4,919 yards and red 4,747 yards. Its hole-1 distances conflict with the club's individual hole-1 page (overview white/yellow 504/488 vs hole-tour 493/484). The overview is used consistently, and the conflict is flagged. Scorecard lengths are official playing-line yardages, not guaranteed straight-line geodesic distances.

## Source URLs

- https://www.openstreetmap.org/api/0.6/map?bbox=0.055,51.407,0.070,51.418
- https://www.openstreetmap.org/way/7975880
- Individual hole IDs and green IDs are retained; https://www.openstreetmap.org/way/849876688 is hole 1.
- https://www.chislehurstgolfclub.co.uk/the_course
- https://www.chislehurstgolfclub.co.uk/hole_1
- https://www.chislehurstgolfclub.co.uk/world_handicap_system
- https://eagleplus.uk.com/c/chislehurst/course-ratings-men/
- https://eagleplus.uk.com/c/chislehurst/course-ratings-women/
- https://stymie.golf/golf-courses/united-kingdom/england/chislehurst/chislehurst-golf-course

## Attribution and licence

Map data © OpenStreetMap contributors, available under the Open Database License (ODbL) 1.0:
https://www.openstreetmap.org/copyright
https://opendatacommons.org/licenses/odbl/1-0/

The map-derived database in this package is made available under ODbL 1.0. Retain attribution and source metadata in downstream distributions. Scorecard facts and ratings are separately attributed above; this package does not claim ownership of the source websites or imagery.

## Validation performed

18 consecutive hole numbers; 18 unique matched playing greens; every line endpoint inside its assigned green; every computed green centroid inside that green; every mapped reference start inside a tee polygon; all 54 provisional colour points within a mapped tee polygon; men's SI and published red SI each permutations of 1–18; scorecard totals checked. This is geometric consistency checking, NOT independent ground-truth verification.
