import assert from 'node:assert/strict';
import { assessShotOutcome, createShotGoal } from '../src/benchmarkModel.js';
import { compareCandidate } from '../src/scoringModel.js';

const goal = (overrides) => createShotGoal({
  startDistanceYards: 220,
  routeClear: true,
  isTeeShot: true,
  driverDistance: 150,
  fairwayDistance: 120,
  targetHandicap: 12,
  ...overrides,
});

const examples = {
  stated150: goal({ startDistanceYards: 300 }),
  formerlyImpossible: goal({ startDistanceYards: 190, driverDistance: 120 }),
  poor70: assessShotOutcome({
    goal: goal({ startDistanceYards: 220, driverDistance: 240 }),
    endDistanceYards: 150,
    shotDistanceYards: 72,
    routeEnd: true,
  }),
  short25: assessShotOutcome({
    goal: goal({ startDistanceYards: 25, isTeeShot: false, fairwayDistance: 180 }),
    endDistanceYards: 0,
    shotDistanceYards: 25,
    routeEnd: true,
  }),
  backwardsRecovery: assessShotOutcome({
    goal: goal({ startDistanceYards: 60, routeClear: false, isTeeShot: false }),
    endDistanceYards: 80,
    shotDistanceYards: 30,
    routeEnd: true,
  }),
};

assert.equal(examples.stated150.capabilityYards, 150);
assert.ok(examples.formerlyImpossible.requiredProgressYards <= 120);
assert.equal(examples.poor70.progressYards, 70);
assert.equal(examples.poor70.targetMet, false);
assert.equal(examples.short25.context, 'short-approach');
assert.equal(examples.short25.targetMet, true);
assert.equal(examples.backwardsRecovery.progressYards, -20);
assert.equal(examples.backwardsRecovery.targetMet, true);
assert.equal(examples.poor70.handicapBand, null);

let checkedGoals = 0;
for (const isTeeShot of [true, false]) {
  for (const capability of [60, 120, 150, 200, 250]) {
    for (let start = 10; start <= 600; start += 10) {
      let previousEnd = -Infinity;
      for (let handicap = 0; handicap <= 54; handicap += 1) {
        const candidate = goal({
          startDistanceYards: start,
          isTeeShot,
          driverDistance: capability,
          fairwayDistance: capability,
          targetHandicap: handicap,
        });
        assert.ok(candidate.requiredProgressYards <= capability + 0.11, 'goal exceeds capability');
        assert.ok(candidate.maximumEndDistanceYards >= previousEnd, 'higher handicap made target stricter');
        previousEnd = candidate.maximumEndDistanceYards;
        checkedGoals += 1;
      }
    }
  }
}

const factualLow = assessShotOutcome({ goal: goal({ targetHandicap: 6 }), endDistanceYards: 100, shotDistanceYards: 125, routeEnd: true });
const factualHigh = assessShotOutcome({ goal: goal({ targetHandicap: 36 }), endDistanceYards: 100, shotDistanceYards: 125, routeEnd: true });
for (const field of ['context', 'startDistanceYards', 'endDistanceYards', 'shotDistanceYards', 'progressYards', 'direction', 'routeChange']) {
  assert.deepEqual(factualLow[field], factualHigh[field], `factual assessment changed with target handicap: ${field}`);
}

const scoringRound = {
  scoringProfile: { supported: true, slopeRating: 120, courseRating: 64.7, par: 66 },
  holes: Array.from({ length: 18 }, (_, index) => ({
    status: 'finished',
    par: index % 3 === 0 ? 3 : 4,
    strokeIndex: index + 1,
    result: { grossStrokes: index % 3 === 0 ? 4 : 5 },
  })),
};
let priorPoints = -Infinity;
for (let handicap = -5; handicap <= 54; handicap += 1) {
  const comparison = compareCandidate(scoringRound, handicap);
  assert.ok(comparison.points >= priorPoints, 'candidate points are not monotonic');
  priorPoints = comparison.points;
}

console.log(JSON.stringify({
  examples: {
    stated150: { capabilityYards: examples.stated150.capabilityYards, requiredProgressYards: examples.stated150.requiredProgressYards },
    formerlyImpossible: { capabilityYards: examples.formerlyImpossible.capabilityYards, requiredProgressYards: examples.formerlyImpossible.requiredProgressYards, maximumEndDistanceYards: examples.formerlyImpossible.maximumEndDistanceYards },
    poor70: { progressYards: examples.poor70.progressYards, targetMet: examples.poor70.targetMet, handicapBand: examples.poor70.handicapBand },
    short25: { context: examples.short25.context, endDistanceYards: examples.short25.endDistanceYards, targetMet: examples.short25.targetMet },
    backwardsRecovery: { progressYards: examples.backwardsRecovery.progressYards, direction: examples.backwardsRecovery.direction, routeChange: examples.backwardsRecovery.routeChange, targetMet: examples.backwardsRecovery.targetMet },
  },
  invariantChecks: { reachableAndMonotonicGoals: checkedGoals, factualAssessmentIndependentOfTargetHandicap: true, stablefordCandidatePointsMonotonic: true },
}, null, 2));
