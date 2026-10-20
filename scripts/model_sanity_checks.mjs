import assert from 'node:assert/strict';
import { assessShotOutcome, createShotGoal, expectedEndDistance } from '../src/benchmarkModel.js';
import { compareCandidate } from '../src/scoringModel.js';

assert.equal(expectedEndDistance(100, 12), 17.7);
assert.equal(expectedEndDistance(105, 12), 18.2);
assert.equal(expectedEndDistance(100, 12.5), 18);
assert.equal(expectedEndDistance(350, 12), 102.4);

let checkedGoals = 0;
for (let start = 0; start <= 600; start += 5) {
  let previousEnd = -Infinity;
  for (let handicap = -5; handicap <= 54; handicap += 0.5) {
    const candidate = createShotGoal({
      startDistanceYards: start,
      routeClear: checkedGoals % 2 === 0,
      isTeeShot: checkedGoals % 3 === 0,
      targetHandicap: handicap,
    });
    assert.ok(candidate.maximumEndDistanceYards >= 0, 'negative expected end distance');
    assert.ok(candidate.maximumEndDistanceYards <= start + 0.11, 'expected end is farther than the start');
    assert.ok(candidate.maximumEndDistanceYards >= previousEnd, 'higher handicap made target stricter');
    previousEnd = candidate.maximumEndDistanceYards;
    checkedGoals += 1;
  }
}

const routeVariants = [true, false].map((routeClear) => createShotGoal({
  startDistanceYards: 200,
  routeClear,
  isTeeShot: routeClear,
  targetHandicap: 18,
}));
assert.equal(routeVariants[0].maximumEndDistanceYards, routeVariants[1].maximumEndDistanceYards);

const goal = createShotGoal({ startDistanceYards: 100, routeClear: true, isTeeShot: false, targetHandicap: 12 });
const blockedFinish = assessShotOutcome({ goal, endDistanceYards: 17, shotDistanceYards: 85, routeEnd: false });
assert.equal(blockedFinish.targetMet, true);
assert.equal(blockedFinish.routeChange, 'worsened');

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
  model: 'expected-distance-lookup-v1',
  exactLookupExample: expectedEndDistance(100, 12),
  invariantChecks: {
    nonnegativeMonotonicGoals: checkedGoals,
    routeIndependentDistanceTarget: true,
    stablefordCandidatePointsMonotonic: true,
  },
}, null, 2));
