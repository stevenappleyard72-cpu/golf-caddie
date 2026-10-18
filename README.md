# GolfCaddie

Local-first, single-player mobile PWA foundations for recording a round at Chislehurst Golf Club.

## Run locally

```sh
npm install
npm test
npm run check:model
npm run build
npm start
```

Open `http://localhost:4174`. The production server serves the built app, `/api/health` and `/api/course`.

## Install on an Android phone

The phone must open GolfCaddie from a deployed HTTPS address; a desktop computer's `localhost` URL is not a phone-accessible installation link. Open that address in Chrome, press **Install GolfCaddie**, and accept the prompt. If Chrome does not offer the prompt yet, use its menu and choose **Install app** or **Add to Home screen**. The installed icon launches the standalone PWA.

Before going offline, open the installed app once while connected and wait for **Offline copy ready**. Allow location access when the first ball position is recorded. Course data, calculations and round progress then remain on the phone; GPS location services must stay enabled, but network connectivity is not required during the round.

## Current scope

- Profile fields: sex, target Handicap Index, typical total driver distance, longest reliable total fairway distance and tee colour.
- Round state, calculations and persistence stay in the browser.
- Simulation and GPS recording use the same round engine.
- Only male/yellow, male/white and female/red have complete supported scoring profiles in the supplied data. Other combinations retain distance tracking without substituting another profile.
- Course tee colours and green centres are provisional as documented in `Documents/GolfCaddie_Handover/chislehurst_course/README.md`.
- Capability coaching is implemented as a transparent provisional model documented in `docs/capability-coaching-model.md`. It gives factual shot feedback, reachable next targets and target-success totals without unsupported shot-handicap labels.
- After each finished hole, supported scoring profiles show Stableford points at the player's target handicap and one approximate handicap indicated by the completed-hole scores. The estimate does not change during a hole and is not an official Handicap Index or score for posting.
- `docs/benchmark-model.md` and `scripts/benchmark_calculations.py` are rejected audit artifacts and are not imported by runtime code.

## Local review checklist

1. Start a simulation round and confirm the first shot starts from the selected stored tee.
2. In simulation, enter the ball's new distance from the green centre, choose whether the new route is Clear or Recovery, and press **Record ball position**. Confirm the app derives the shot distance and reports whether the stored target was met. Use **Record penalty** once and confirm it records one played shot plus one penalty at that same position; undo should remove both together.
3. Finish the hole with putts and, if useful, a manual total correction; confirm automatic advance to the next stored tee.
4. Undo the finish and confirm the prior hole and its events return.
5. Reload the page and confirm the round resumes from IndexedDB.
6. Export JSON, abandon the round, then import the JSON from setup.
7. Wait for “Offline copy ready”, disconnect the network and reload.
8. On a Pixel 7 or equivalent Android phone, install from the HTTPS page, launch from the icon, and test location permission, a good fix, a poor-fix override and retry. Switch to airplane mode after **Offline copy ready**, relaunch from the icon, record and undo a position, then restore connectivity.

No deployment has been performed.

## Deployment configuration for later

`render.yaml` describes a single Node web service that builds the Vite frontend, serves it with Express and exposes `/api/health`. Automatic deployment is disabled. When deployment is authorised, connect this repository in Render and review the service name/plan before applying the blueprint.

`.env.example` documents the optional server port. No API credentials are required.
