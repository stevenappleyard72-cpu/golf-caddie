export const BENCHMARK_MODEL_VERSION = 'capability-coach-v1-provisional';
export const MAX_ASSESSMENT_ACCURACY_METRES = 23;

const clamp = (value, low, high) => Math.max(low, Math.min(value, high));
const round1 = (value) => Math.round(value * 10) / 10;

export function targetParameters(targetHandicap) {
  const handicap = clamp(Number(targetHandicap), 0, 54);
  return {
    handicap,
    capabilityUtilisation: round1(92 - handicap * 0.5) / 100,
    terminalRadiusYards: round1(8 + handicap * (22 / 54)),
  };
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
  driverDistance,
  fairwayDistance,
  targetHandicap,
}) {
  const start = Math.max(0, Number(startDistanceYards));
  const context = shotContext({ isTeeShot, routeClear, startDistanceYards: start });
  const parameters = targetParameters(targetHandicap);

  if (context === 'recovery') {
    return {
      modelVersion: BENCHMARK_MODEL_VERSION,
      kind: 'recovery',
      context,
      startDistanceYards: round1(start),
      maximumEndDistanceYards: null,
      requiredProgressYards: null,
      capabilityYards: null,
      requiredRouteClear: true,
      calibration: parameters,
    };
  }

  const capability = Math.max(1, Number(isTeeShot ? driverDistance : fairwayDistance));
  const greenReachable = start <= capability;
  const maximumEndDistance = greenReachable
    ? Math.min(start, parameters.terminalRadiusYards)
    : Math.max(0, start - capability * parameters.capabilityUtilisation);
  const requiredProgress = Math.max(0, start - maximumEndDistance);

  return {
    modelVersion: BENCHMARK_MODEL_VERSION,
    kind: 'distance',
    context,
    startDistanceYards: round1(start),
    maximumEndDistanceYards: round1(maximumEndDistance),
    requiredProgressYards: round1(requiredProgress),
    capabilityYards: round1(capability),
    requiredRouteClear: true,
    greenReachable,
    calibration: parameters,
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
    : goal.kind === 'recovery'
      ? Boolean(routeEnd)
      : Boolean(routeEnd) && end <= goal.maximumEndDistanceYards;

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
