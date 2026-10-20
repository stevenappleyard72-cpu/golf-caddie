import {
  EXPECTED_DISTANCE_LOOKUP,
  EXPECTED_DISTANCE_LOOKUP_SOURCE,
  EXPECTED_DISTANCE_YARDS,
} from './expectedDistanceLookup.js';

export const BENCHMARK_MODEL_VERSION = 'expected-distance-lookup-v1';
export const MAX_ASSESSMENT_ACCURACY_METRES = 23;

const clamp = (value, low, high) => Math.max(low, Math.min(value, high));
const round1 = (value) => Math.round(value * 10) / 10;

function expectedDistanceForRow(row, startDistanceYards) {
  const start = Math.max(0, Number(startDistanceYards));
  const firstDistance = EXPECTED_DISTANCE_YARDS[0];
  const lastIndex = EXPECTED_DISTANCE_YARDS.length - 1;
  const lastDistance = EXPECTED_DISTANCE_YARDS[lastIndex];

  if (start <= firstDistance) {
    return row.expectedEndDistances[0] * start / firstDistance;
  }
  if (start >= lastDistance) {
    return row.expectedEndDistances[lastIndex] + (start - lastDistance);
  }

  const upperIndex = EXPECTED_DISTANCE_YARDS.findIndex((distance) => distance >= start);
  const lowerIndex = upperIndex - 1;
  const lowerDistance = EXPECTED_DISTANCE_YARDS[lowerIndex];
  const upperDistance = EXPECTED_DISTANCE_YARDS[upperIndex];
  const ratio = (start - lowerDistance) / (upperDistance - lowerDistance);
  return row.expectedEndDistances[lowerIndex]
    + ratio * (row.expectedEndDistances[upperIndex] - row.expectedEndDistances[lowerIndex]);
}

export function expectedEndDistance(startDistanceYards, targetHandicap) {
  const minimumHandicap = EXPECTED_DISTANCE_LOOKUP[0].handicap;
  const maximumHandicap = EXPECTED_DISTANCE_LOOKUP.at(-1).handicap;
  const handicap = clamp(Number(targetHandicap), minimumHandicap, maximumHandicap);
  const lowerIndex = Math.floor(handicap - minimumHandicap);
  const upperIndex = Math.min(lowerIndex + 1, EXPECTED_DISTANCE_LOOKUP.length - 1);
  const ratio = handicap - Math.floor(handicap);
  const lower = expectedDistanceForRow(EXPECTED_DISTANCE_LOOKUP[lowerIndex], startDistanceYards);
  const upper = expectedDistanceForRow(EXPECTED_DISTANCE_LOOKUP[upperIndex], startDistanceYards);
  return round1(lower + ratio * (upper - lower));
}

export function shotContext({ isTeeShot, routeClear, startDistanceYards }) {
  if (!routeClear) return 'recovery';
  if (isTeeShot) return 'tee-shot';
  if (startDistanceYards <= 60) return 'short-approach';
  return 'fairway-shot';
}

export function createShotGoal({
  startDistanceYards,
  routeClear,
  isTeeShot,
  targetHandicap,
}) {
  const start = Math.max(0, Number(startDistanceYards));
  const context = shotContext({ isTeeShot, routeClear, startDistanceYards: start });
  const maximumEndDistance = expectedEndDistance(start, targetHandicap);
  const requiredProgress = Math.max(0, start - maximumEndDistance);

  return {
    modelVersion: BENCHMARK_MODEL_VERSION,
    kind: 'distance',
    context,
    startDistanceYards: round1(start),
    maximumEndDistanceYards: round1(maximumEndDistance),
    requiredProgressYards: round1(requiredProgress),
    lookupSource: EXPECTED_DISTANCE_LOOKUP_SOURCE,
    targetHandicap: Number(targetHandicap),
  };
}

export function assessShotOutcome({
  goal,
  endDistanceYards,
  shotDistanceYards,
  routeEnd,
  passedGreen = false,
  accuracyMetres = null,
}) {
  const end = Math.max(0, Number(endDistanceYards));
  const progress = goal.startDistanceYards - end;
  const tolerance = 2;
  const direction = progress > tolerance ? 'forward' : progress < -tolerance ? 'backward' : 'stationary';
  const routeChange = goal.context === 'recovery' && routeEnd
    ? 'improved'
    : goal.context !== 'recovery' && !routeEnd
      ? 'worsened'
      : 'unchanged';
  const lowAccuracy = accuracyMetres != null && accuracyMetres > MAX_ASSESSMENT_ACCURACY_METRES;
  const targetMet = lowAccuracy
    ? null
    : end <= goal.maximumEndDistanceYards;

  return {
    modelVersion: BENCHMARK_MODEL_VERSION,
    context: goal.context,
    startDistanceYards: goal.startDistanceYards,
    endDistanceYards: round1(end),
    shotDistanceYards: round1(Math.max(0, Number(shotDistanceYards))),
    progressYards: round1(progress),
    direction,
    routeChange,
    routeEnd: Boolean(routeEnd),
    passedGreen: Boolean(passedGreen),
    targetMet,
    assessmentStatus: lowAccuracy ? 'unassessed_low_accuracy' : 'assessed',
    targetGoal: goal,
    handicapBand: null,
  };
}

export function targetProgress(round) {
  const assessments = round.holes
    .flatMap((hole) => hole.events)
    .filter((event) => event.type === 'stroke' && event.assessment?.targetMet != null)
    .map((event) => event.assessment.targetMet);
  const met = assessments.filter(Boolean).length;
  return {
    met,
    assessed: assessments.length,
    percentage: assessments.length ? Math.round(met / assessments.length * 100) : null,
  };
}
