# Golf target coach — implementation plan

Status: working local prototype; foundations and the replacement benchmark model are implemented. Completion marks below reflect verified behaviour, not file presence.
Prepared: 18 October 2026.

## Working instructions for Codex

Read this plan and `chislehurst_course/README.md` before implementation. MathsGrid's former reference role is complete; continue exclusively within GolfCaddie. Keep this project in its own folder and Git repository and never copy credentials, Git history or deployment identifiers from another project.

Use the existing stack where sensible. Choose the simplest implementation that meets this plan; avoid introducing frameworks and external services without a concrete need. After the initial findings, implement in small working stages. Keep this document updated with completed work, checks, decisions and remaining issues. Do not replace agreed requirements with assumptions silently. Routine implementation decisions do not need repeated approval.

This document is the handover from a design conversation. It does not imply that a benchmark model, official handicap calculator or existing working app has been supplied. Read the supplied course schema before adapting it; do not assume its field names or scoring profiles.

## Purpose and scope

A personal, single-player golf companion for a phone. Set a target handicap, record where each shot finishes, receive a simple next-shot distance target, and see how closely play meets that target. Initial use is at Chislehurst Golf Club, with a data structure that can support other courses later.

Deliver an Android-friendly progressive web app (PWA) opened by URL and addable to the home screen. No native Android build, accounts, multiplayer, payments, server database, online commentary or automatic course discovery in version one. Round recording and numerical feedback must continue offline after initial loading.

## Startup

One player per round. Save the profile locally for reuse and allow edits before a new round:

- Sex: male or female, required.
- Target Handicap Index, required. Do not ask for current handicap.
- Typical driver distance in yards, using total distance consistently.
- Longest reliable fairway shot distance in yards, using total distance consistently.
- Tee colour: red, yellow or white; default yellow.

Show Chislehurst as the prepared course. Tee selection changes course data and, when available, the sex-specific scoring profile. Show unavailable scoring combinations clearly without preventing distance tracking.

Starting a round does not capture a GPS tee position. Every hole starts at the selected tee coordinate from course data, including holes reached after finishing the preceding hole. Moved daily tee markers are outside version-one scope.

## On-course interaction

Keep the main screen readable outdoors with large buttons and few inputs. Show hole number, par where verified, strokes recorded and distance to green centre.

### Record ball position

At the ball, press **Record ball position**. Capture a fresh GPS fix with timestamp and reported accuracy. The first position recorded on a hole is where the tee shot landed. Each later position is the endpoint of the next shot, measured from the previous ball position. Never require a separate Start hole action.

Provide a small **Clear route to green? Yes / No** control, default Yes, attached to the current position. No marks a recovery situation; it is not detailed hazard modelling. Preserve the previous position's route flag so the following shot is assessed from the situation it started in. Distance alone cannot identify whether a newly reached position is blocked, so let the player correct the flag and recalculate.

Show three compact feedback lines:

- Last shot: 150 yards played; 145 yards of progress; target met.
- Next shot: finish within 40 yards of the green.
- Target met on 10 of 15 assessed shots (67%).

Generate values from the implemented model and the actual recorded position. No judgement of effort, technique or intent. Do not mention a current handicap that was never entered.

Treat GPS failures and poor fixes explicitly: allow retry or an intentional override, do not silently count duplicate taps as shots, and do not invent coordinates. A stationary or backwards shot can be real; do not reject it merely because it did not gain distance. Keep the GPS accuracy display compact. Refresh should never lose a round.

### Penalties

Provide one **Record penalty** button beside **Record ball position**. Treat it as a combined action: record the shot endpoint at the player's current position and add one penalty stroke. In GPS play, capture the same single fix that a normal recorded position would use. In simulation, use the same entered distance from the green. The next shot starts from that position. The approximation deliberately ignores the small difference between the hazard-entry point and where the player stands, in favour of an on-course one-button workflow. Include both the played stroke and penalty in hole totals, and undo them together as one action.

### Finish hole and undo

Provide **Finish hole** with total strokes including penalties and number of putts. Pre-fill the stroke total from recorded events; allow an explicit correction, validating putts against the total. Record putts in aggregate. Do not fabricate individual putting positions or assess each putt from a total count.

Permit a picked-up hole with an explicit status, so it can contribute zero Stableford points without inventing an exact score. After finishing, automatically move to the next hole. The next Record ball position action records that hole's tee-shot endpoint from its stored tee coordinate. After hole 18, show the summary.

Allow undo of the most recent action, including a penalty or finishing a hole. Recompute derived results consistently. Preserve manual corrections and explain if a correction leaves some strokes unassessed.

## Distances and benchmark model

Use WGS84 GPS coordinates, calculate geodesic distances consistently and display yards. The remaining distance is to the mapped green centre. Do not confuse official scorecard length along the playing line with straight-line GPS distance. Version one does not track pin position or generate GPS putting targets; show next-shot targets to green centre until the player finishes the hole.

The core task is to assess the completed shot and calculate a reachable next-shot target from the ball's actual current location. A poor drive changes the next starting position; do not keep returning a prewritten target for shot number two. Use target handicap, driver distance, reliable fairway distance, hole context and the route flag. The two measured player distances define distance capability; do not apply a demographic strength adjustment. Sex selects the applicable course scoring profile only.

Implement a small deterministic, versioned, editable benchmark model locally. It may use fixed parameters or curves; its results must vary with the actual start and finish state. It must not depend on asking an LLM to invent new benchmarks every stroke.

Before coding the model, document a concrete formula or set of curves, its parameters and several worked examples. The approved runtime replacement is in `docs/capability-coaching-model.md`; `docs/benchmark-model.md` remains the rejected audit artifact. Include how the replacement handles tee shots, approaches, short shots, backwards shots, recovery flags, penalties, maximum reliable distances and target handicap changes. Ensure an unreachable one-shot goal becomes a feasible lay-up target. Avoid a model that simply divides hole length by a number of strokes or treats every long shot as good. Do not infer a precise handicap from distance gained alone.

No validated empirical shot-by-handicap dataset is provided. The app therefore uses factual shot outcomes rather than invented shot-handicap labels. Coaching target calibration and the completed-hole handicap indication are transparent and provisional. Do not present generated curves as measured statistics or official handicap calculations. Keep technical caveats in documentation rather than cluttering the on-course screen.

Keep the model separate from the UI and store its version with round assessments. The exact model is an implementation design task, not a claim already settled by this brief. Report material limitations plainly, then implement the simplest defensible version within scope.

## Progress and end-of-round feedback

- Count target successes among assessed non-putting strokes; show numerator, denominator and percentage. Unassessed strokes and drop movements must not inflate the percentage. Penalties always affect scoring and must be visible; explain their treatment in shot success reporting.
- After each finished hole, show Stableford points scored at the player's target handicap and one approximate handicap indicated by completed-hole scores. Do not update these figures for shots on the open hole, and do not average shot results to obtain a round handicap.
- Specify and test how candidate handicap levels map to strokes received, points, partial-round extrapolation and the displayed estimate. Use the applicable sex/tee rating, slope, par and stroke-index profile only when supported. Verify current authoritative golf rules during implementation before claiming an official calculation. Clearly name any simplified estimate.
- Before any completed hole, omit the Stableford/handicap line. If a valid scoring profile is unavailable, retain distance coaching and target-shot percentage without substituting another sex's scoring profile.
- At round end show totals, target-shot percentage, target-handicap Stableford points and the approximate indicated handicap when available. Do not show a shot-handicap-band breakdown because there is no defensible empirical calibration for those labels. No confidence score is needed.

## Course data

The supplied directory is `chislehurst_course/` extracted from `Chislehurst_Course_Data.zip`. Keep an original copy in the project and use a separate adapter for the runtime format if needed.

Read these first:

- `README.md` — provenance, scoring limitations and coordinate quality.
- `chislehurst-course.json` — course schema, 18 holes, tee sets, ratings and quality flags.
- `chislehurst-coordinates.csv` and the supplied map images — visual checking aids.

Keep the app course-independent: load one course object by ID instead of embedding Chislehurst assumptions throughout UI or scoring code. No external course API is needed initially. Coordinates must be replaceable through data edits, with no algorithm rewrite.

Important supplied-data limitations:

- Green centres are centroids of matched OpenStreetMap green polygons, not surveyed pin positions.
- Mapped reference tee points have no verified colour in the source.
- Red/yellow/white tee coordinates are inferred and explicitly provisional. Some overlap. Keep quality flags, attribution and correction capability; do not relabel them as verified.
- The mapped geometry dates from 2020–2021; downloading in 2026 does not make it a 2026 survey.
- Men's white/yellow and women's red have the supplied corresponding per-hole scorecard arrays. Women's yellow rating is available, but its female per-hole par/stroke-index profile remains unconfirmed. Do not use the men's yellow array for women.
- Male red rating is secondary-source-only; female white rating is unconfirmed. Disable unsupported official-style scoring combinations until verified. Distance coaching can still work.
- Hole-one published lengths conflict between the club overview and individual hole page; the dataset consistently uses the overview and flags the difference.
- Preserve OpenStreetMap attribution, ODbL licence information and source metadata as described in the README.

## Client and server responsibilities

### Phone/client — authoritative round state

Own profile, course data, GPS capture, event history, undo, round storage, scoring, benchmark calculations and all essential feedback. Persist every accepted action locally, preferably in IndexedDB. Cache app shell and course data using a service worker. Provide resume after closing the browser and JSON export/import for backup. Keep data formats versioned.

Home-screen installation, GPS and service workers must work over HTTPS. Provide clear location-permission handling. Do not rely on background GPS tracking; capture positions while the user is interacting with the app.

### Render server — small stateless service

Serve the built app, health endpoint and prepared course package. Avoid storing round histories, player profiles or raw GPS traces in server logs. No server database or OpenAI integration is required.

Use the existing GolfCaddie deployment structure where suitable. A single service is acceptable because it is simple and preserves offline operation. A sleeping/free backend must not prevent play. Document deploy configuration and environment variables; leave the hosting plan choice to the user.

## Test at home before the first round

On-course testing is difficult to iterate. A development simulation mode is a first-stage requirement, using the same recording and assessment paths as real GPS. Allow simulated positions via a simple local course view or coordinate controls and repeatable scripted rounds. Do not require a paid map API. Keep simulation clearly labelled and isolated from real round data.

Meaningful checks must include:

- A typical drive and approach, a short or backwards drive, an overshoot and a recovery position.
- Target handicap and profile changes producing sensible, reachable next targets.
- Combined shot-plus-penalty accounting, one-action undo and manual totals.
- Finishing a hole, automatic advance, next tee-shot endpoint and all 18 holes.
- GPS denied, unavailable and poor accuracy; duplicate taps; position retry.
- Offline startup after caching, offline full round, reload/resume and export/import.
- Correct supported scoring profiles; unavailable combinations must not silently score.
- Fixed worked benchmark/scoring examples with expected results independent of implementation.

Use unit tests for numerical/state logic and a small set of integration/browser checks for critical round flows. Test Android Chrome/home-screen behaviour on the real phone before the course visit. The first practice round should mainly validate coordinates and usability, not uncover basic accounting or recovery failures.

## Delivery stages

- [x] 1. Complete handover inspection and establish GolfCaddie as a standalone repository.
- [x] 2. Scaffold the separate project, mobile shell, PWA support, local persistence, backend health endpoint and documented local/Render commands. Supply .env.example with placeholders only. Automated service-worker execution verifies cached shell/course responses with the network disabled; real Android installation remains a stage-8 check.
- [x] 3. Load/adapt the supplied course data, profile startup and interactive simulation mode. Schema-v2 adapter and supported/unsupported profile rules are covered by automated tests.
- [x] 4. Implement event recording, penalties, undo, finish/advance, resume and export/import with numerical/state checks. The shared engine, schema migration, IndexedDB adapter and complete 18-hole flow are covered by automated tests; touch-browser usability remains a stage-8 check.
- [x] 5. Document and implement the provisional capability-coaching model and supported Stableford-based round estimate, with executed worked examples, authoritative rule verification and independent sanity checks.
- [x] 6. Add compact feedback, progress and round summary; verify an entire simulated offline round. Full-round state flow and actual service-worker offline behavior pass automated harnesses; real-browser interaction remains a stage-8 check.
- [x] 7. Remove optional online commentary after on-course review showed that it added complexity without helping the core target-handicap task. The server now only serves the app, health check and course data; no OpenAI credentials or runtime calls remain.
- [ ] 8. Complete home/phone checks and document deployment and a short first-round checklist.

Commit working milestones locally. Do not deploy, push or modify remote repositories merely because a configuration exists; follow the user's instructions for publishing. Keep the user informed of concrete results and any decision that changes product scope.

## Implementation notes and checks

Update this section as work proceeds. Record actual commands and outcomes, not claims that checks passed without running them.

- Handover inspection: complete. GolfCaddie is a standalone project with its own retained course package and repository.
- Repository: no parent Git worktree or recoverable GolfCaddie history was present. A standalone repository was initialised in the project folder on 18 October 2026. `.gitignore` excludes dependencies, builds, environment files and local noise. No push or deployment has been performed.
- Stack and hosting structure: Vite + vanilla JavaScript frontend with a small Express backend and an HTTPS-friendly PWA shell. The backend health, course-data and built-app routes were exercised successfully. IndexedDB owns saved profile and round state; there is no server database. Service-worker registration, shell/course caching, an offline-readiness/network-status indicator, an Android install action, standalone/portrait manifest settings and 192/512 maskable home-screen icons are implemented. The app requests persistent browser storage when a round starts where supported. `render.yaml` documents a single service with automatic deployment disabled. A public installation link requires deployment; real-device PWA verification remains pending.
- Course adapter: updated for schema version 2. Verified scoring profiles are male/yellow, male/white and female/red. Female/yellow, female/white and male/red remain explicitly unsupported for scoring while distance tracking stays available. Original handover course files are unchanged.
- Coordinate flow: the runtime API reads `Documents/GolfCaddie_Handover/chislehurst_course/chislehurst-course.json`. An integration test verifies hole 1 yellow tee `51.4116622, 0.0645775`, green centre `51.4147622, 0.0610465`, and both quality flags flow unchanged through the adapter and round engine. Simulation derives event endpoints without mutating retained tee or green positions.
- Profile scope decision: age was removed. Sex is used only to select the course scoring profile. Typical driver distance and longest reliable fairway distance are the complete player distance-capability inputs; there is no demographic strength adjustment and no current-handicap field.
- Round foundations: stored tee origins, endpoint strokes, start/end route flags, combined shot-plus-penalty actions, picked-up holes, manual totals, automatic advance, undo snapshots, local persistence and versioned JSON import/export are implemented through a shared engine. Simulation and GPS call the same engine. Poor GPS fixes require an explicit override; manual score corrections are stored and explained.
- Penalty simplification: **Record penalty** records the current position as the shot endpoint and adds exactly one penalty stroke in the same undoable action. Simulation uses the shared remaining-yards input; GPS uses one current-position fix. The earlier attempted-shot, separate-drop, variable-penalty and stroke-and-distance controls were removed from the UI and engine.
- Finish-hole total: aggregate putts are not recorded as endpoint events, so changing Putts automatically adds them to recorded shots and penalties in the Total strokes field. The total remains editable for an explicit correction. Manual correction accounting excludes the separately entered putts; the prior implementation incorrectly described ordinary putts as unassessed corrections, which was fixed on 18 October 2026. Regression tests verify both the correction calculation and that three recorded shots plus two putts produces gross 5, with Chislehurst hole 1 then scoring 3 Stableford points at target index 12.
- Simulation controls: simulation mirrors real play with the same **Record ball position**, **Record penalty** and **New route** controls. Instead of GPS, the player enters how many yards the ball finished from the green centre. The simulator derives an endpoint on the current ball-to-green line, then the shared round engine calculates shot distance, progress and target success. It accepts a larger remaining distance to exercise a backwards result. Reaching the required distance while ending with a Recovery route remains a target miss.
- Benchmark status: `docs/benchmark-model.md` and `scripts/benchmark_calculations.py` remain rejected, disconnected audit artifacts. The implemented replacement is `docs/capability-coaching-model.md` / `src/benchmarkModel.js`. It produces factual context-aware shot assessment without handicap labels, capability-bounded next goals, and target success from the same stored goal. Recovery goals require a clear route without inventing a distance from a binary flag. All calibration parameters are labelled provisional.
- Scoring rules: Course Handicap, final-step rounding, stroke-index allocation and Stableford handling were checked against current USGA Rules of Handicapping Rule 6 / Appendix E and R&A Rule 21.1 on 18 October 2026. After a hole is finished, the UI shows actual Stableford points calculated at the player's target handicap and one approximate indicated handicap. The indicated value is the midpoint of equally matching candidates and remains provisional rather than an official Handicap Index or score for posting. Open-hole strokes do not change either figure.
- Interface simplification: optional online commentary, access-code controls, technical scoring-profile text and repeated provisional-model notices were removed from the on-course screen. The server and environment configuration no longer contain an OpenAI path or credential fields.
- On-course/mobile hardening: the recording controls now appear before detailed feedback, Pixel-width layouts keep the route selector and two 54px-high recording buttons compact, and safe-area insets support modern Android displays. GPS requests use a fresh high-accuracy fix, allow 30 seconds, explain permission/unavailable/timeout failures, and still require confirmation above ±35m. Submit actions reject duplicate taps while saving. The page offers **Install GolfCaddie** through Android's PWA installation prompt with Chrome menu instructions as a fallback.
- Checks run 18 October 2026: `npm test` passed 39 tests after mobile hardening and the putt/correction fix, including open-hole scoring stability, aggregate putts in gross totals, Chislehurst hole 1 gross 5 scoring 3 Stableford points at target index 12, atomic shot-plus-penalty recording/undo, PWA install metadata and mobile safe-area declarations. `npm run check:model` executed every rejected-case example plus 33,000 reachability/monotonicity combinations and a Stableford candidate monotonicity check. `npm run build` passed. HTTP smoke checks returned 200 for the built app, health, course, service-worker and manifest routes. All eight extracted course-package files matched the supplied ZIP byte-for-byte. The service-worker harness executes the actual worker and verifies cached app-shell and course responses with its network disabled. A rendered Pixel 7 browser check could not be completed in the development environment because no browser instance was available; real Pixel 7 installation, GPS and airplane-mode relaunch remain stage-8 checks.
