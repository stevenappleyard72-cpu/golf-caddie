import { assessShotOutcome, BENCHMARK_MODEL_VERSION, createShotGoal } from './benchmarkModel.js';
import { distanceYards, hasPassedGreen } from './geo.js';

export const ROUND_SCHEMA_VERSION = 2;

const clone = (value) => structuredClone(value);

function withoutHistory(round) {
  const snapshot = clone(round);
  snapshot.undoHistory = [];
  return snapshot;
}

function mutateWithUndo(round, mutation) {
  const next = clone(round);
  const history = [...(next.undoHistory || []), withoutHistory(round)];
  mutation(next);
  next.undoHistory = history;
  next.revision += 1;
  next.updatedAt = new Date().toISOString();
  return next;
}

function finiteNumber(value, label, minimum = -Infinity) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum) throw new Error(`${label} is invalid`);
  return number;
}

export function validateProfile(profile) {
  if (!['red', 'yellow', 'white'].includes(profile?.teeColour)) throw new Error('Tee colour is invalid');
  const targetHandicap = finiteNumber(profile.targetHandicap, 'Target Handicap Index', -10);
  if (targetHandicap > 54) throw new Error('Target Handicap Index must be 54 or lower');
  return { targetHandicap, teeColour: profile.teeColour };
}

export function createRound({ profile, course, scoringProfile, holes, mode = 'simulation' }) {
  const validProfile = validateProfile(profile);
  if (!Array.isArray(holes) || holes.length !== 18) throw new Error('A round requires 18 prepared holes');
  const now = new Date().toISOString();
  return {
    schemaVersion: ROUND_SCHEMA_VERSION,
    id: globalThis.crypto?.randomUUID?.() || `round-${Date.now()}`,
    revision: 0,
    createdAt: now,
    updatedAt: now,
    status: 'active',
    mode,
    course: { id: course.id, name: course.name, coordinateSystem: course.coordinateSystem },
    profile: validProfile,
    scoringProfile: scoringProfile.supported
      ? {
          supported: true,
          tee: scoringProfile.tee,
          courseRating: scoringProfile.courseRating,
          slopeRating: scoringProfile.slopeRating,
          par: scoringProfile.par,
        }
      : { supported: false, tee: validProfile.teeColour, reason: scoringProfile.reason },
    benchmarkStatus: 'active_provisional',
    benchmarkModelVersion: BENCHMARK_MODEL_VERSION,
    currentHoleIndex: 0,
    holes: holes.map((hole) => ({ ...clone(hole), status: 'open', events: [], result: null })),
    undoHistory: [],
  };
}

export function getCurrentHole(round) {
  return round.currentHoleIndex < round.holes.length ? round.holes[round.currentHoleIndex] : null;
}

export function getBallState(hole) {
  let position = hole.teeOrigin;
  let routeClear = true;
  let accuracy = null;
  let location = null;
  for (const event of hole.events) {
    if (event.type === 'stroke' && event.endpoint) {
      position = event.endpoint;
      routeClear = event.routeEnd;
      accuracy = event.accuracy;
      location = event.location || null;
    }
    if (event.type === 'penalty') {
      position = event.dropPosition;
      routeClear = event.routeEnd;
      accuracy = event.accuracy;
      location = event.location || null;
    }
  }
  return { position: clone(position), routeClear, accuracy, location: clone(location) };
}

export function holeAccounting(hole) {
  const strokes = hole.events.filter((event) => event.type === 'stroke').length;
  const penalties = hole.events
    .filter((event) => event.type === 'penalty')
    .reduce((sum, event) => sum + event.penaltyStrokes, 0);
  const assessedStrokes = hole.events.filter((event) => event.type === 'stroke' && event.endpoint).length;
  return { strokes, penalties, assessedStrokes, eventTotal: strokes + penalties };
}

export function suggestedTotalStrokes(hole, putts = 0) {
  const puttCount = finiteNumber(putts, 'Putts', 0);
  if (!Number.isInteger(puttCount)) throw new Error('Putts must be a whole number');
  return holeAccounting(hole).eventTotal + puttCount;
}

function appendStroke(next, hole, {
  endpoint, routeEnd, accuracy, source, timestamp,
  locationQuality = null, locationAgeMs = null, locationFiltered = false, locationSampleCount = 1,
}) {
  if (!endpoint || !Number.isFinite(endpoint.latitude) || !Number.isFinite(endpoint.longitude)) {
    throw new Error('A valid stroke endpoint is required');
  }
  const start = getBallState(hole);
  const isTeeShot = !hole.events.some((event) => event.type === 'stroke');
  const goal = createShotGoal({
    startDistanceYards: distanceYards(start.position, hole.greenCentre),
    routeClear: start.routeClear,
    isTeeShot,
    targetHandicap: next.profile.targetHandicap,
  });
  const reportedAccuracy = accuracy == null ? null : finiteNumber(accuracy, 'Accuracy', 0);
  const combinedAccuracy = [start.accuracy, reportedAccuracy].filter((value) => value != null);
  const assessment = assessShotOutcome({
    goal,
    endDistanceYards: distanceYards(endpoint, hole.greenCentre),
    shotDistanceYards: distanceYards(start.position, endpoint),
    routeEnd,
    passedGreen: hasPassedGreen(start.position, endpoint, hole.greenCentre),
    accuracyMetres: combinedAccuracy.length ? Math.max(...combinedAccuracy) : null,
  });
  const stroke = {
    id: globalThis.crypto?.randomUUID?.() || `stroke-${Date.now()}`,
    type: 'stroke',
    startPosition: start.position,
    endpoint: clone(endpoint),
    routeStart: start.routeClear,
    routeEnd: Boolean(routeEnd),
    accuracy: reportedAccuracy,
    source,
    timestamp: timestamp || new Date().toISOString(),
    location: source === 'gps' ? {
      quality: locationQuality,
      ageMs: locationAgeMs,
      filtered: Boolean(locationFiltered),
      sampleCount: locationSampleCount,
    } : null,
    assessmentStatus: assessment.assessmentStatus,
    assessment,
  };
  hole.events.push(stroke);
  return stroke;
}

export function recordStroke(round, {
  endpoint, routeEnd = true, accuracy = null, source = 'simulation', timestamp = null,
  locationQuality = null, locationAgeMs = null, locationFiltered = false, locationSampleCount = 1,
}) {
  if (round.status !== 'active') throw new Error('The round is not active');
  return mutateWithUndo(round, (next) => {
    const hole = getCurrentHole(next);
    if (!hole || hole.status !== 'open') throw new Error('No open hole is available');
    appendStroke(next, hole, {
      endpoint, routeEnd, accuracy, source, timestamp,
      locationQuality, locationAgeMs, locationFiltered, locationSampleCount,
    });
  });
}

export function recordPenaltyShot(round, {
  endpoint, routeEnd = true, accuracy = null, source = 'simulation', timestamp = null,
  locationQuality = null, locationAgeMs = null, locationFiltered = false, locationSampleCount = 1,
}) {
  if (round.status !== 'active') throw new Error('The round is not active');
  return mutateWithUndo(round, (next) => {
    const hole = getCurrentHole(next);
    if (!hole || hole.status !== 'open') throw new Error('No open hole is available');
    const stroke = appendStroke(next, hole, {
      endpoint, routeEnd, accuracy, source, timestamp,
      locationQuality, locationAgeMs, locationFiltered, locationSampleCount,
    });
    hole.events.push({
      id: globalThis.crypto?.randomUUID?.() || `penalty-${Date.now()}`,
      type: 'penalty',
      penaltyStrokes: 1,
      dropPosition: clone(endpoint),
      routeEnd: Boolean(routeEnd),
      returnToPrevious: false,
      attemptedShot: 'recorded',
      accuracy: stroke.accuracy,
      source,
      timestamp: timestamp || new Date().toISOString(),
      location: stroke.location,
    });
  });
}

export function finishHole(round, { totalStrokes, putts = 0, pickedUp = false }) {
  return mutateWithUndo(round, (next) => {
    const hole = getCurrentHole(next);
    if (!hole || hole.status !== 'open') throw new Error('No open hole is available');
    const accounting = holeAccounting(hole);
    const puttCount = finiteNumber(putts, 'Putts', 0);
    if (!Number.isInteger(puttCount)) throw new Error('Putts must be a whole number');

    if (pickedUp) {
      hole.status = 'picked-up';
      hole.result = { pickedUp: true, grossStrokes: null, putts: puttCount, eventTotal: accounting.eventTotal, correction: null };
    } else {
      const gross = finiteNumber(totalStrokes, 'Total strokes', 1);
      if (!Number.isInteger(gross)) throw new Error('Total strokes must be a whole number');
      if (gross < accounting.penalties) throw new Error('Total strokes cannot be lower than penalty strokes');
      if (puttCount > gross) throw new Error('Putts cannot exceed total strokes');
      hole.status = 'finished';
      hole.result = {
        pickedUp: false,
        grossStrokes: gross,
        putts: puttCount,
        eventTotal: accounting.eventTotal,
        correction: gross - accounting.eventTotal - puttCount,
      };
    }

    next.currentHoleIndex += 1;
    if (next.currentHoleIndex >= next.holes.length) next.status = 'completed';
  });
}

export function undoLastAction(round) {
  if (!round.undoHistory?.length) throw new Error('Nothing to undo');
  const history = [...round.undoHistory];
  const previous = history.pop();
  previous.undoHistory = history;
  previous.revision = round.revision + 1;
  previous.updatedAt = new Date().toISOString();
  return previous;
}

export function validateImportedRound(value, courseId) {
  if (!value || ![1, ROUND_SCHEMA_VERSION].includes(value.schemaVersion)) throw new Error('Unsupported round file version');
  if (value.course?.id !== courseId) throw new Error('The round file is for a different course');
  const profile = validateProfile(value.profile);
  if (!Array.isArray(value.holes) || value.holes.length !== 18) throw new Error('The round file does not contain 18 holes');
  if (!Number.isInteger(value.currentHoleIndex) || value.currentHoleIndex < 0 || value.currentHoleIndex > 18) {
    throw new Error('The round file has an invalid current hole');
  }
  const imported = clone(value);
  if (imported.schemaVersion === 1) {
    imported.schemaVersion = ROUND_SCHEMA_VERSION;
    imported.benchmarkStatus = 'active_provisional';
    imported.benchmarkModelVersion = BENCHMARK_MODEL_VERSION;
    for (const hole of imported.holes) {
      for (const event of hole.events || []) {
        if (event.type === 'stroke' && !event.assessment) event.assessmentStatus = 'legacy_unassessed';
      }
    }
  }
  imported.profile = profile;
  if (imported.scoringProfile) delete imported.scoringProfile.sex;
  imported.benchmarkModelVersion = BENCHMARK_MODEL_VERSION;
  return imported;
}

export function roundSummary(round) {
  const completed = round.holes.filter((hole) => hole.status === 'finished' || hole.status === 'picked-up');
  return {
    completedHoles: completed.length,
    grossStrokes: completed.reduce((sum, hole) => sum + (hole.result?.grossStrokes || 0), 0),
    penalties: round.holes.reduce((sum, hole) => sum + holeAccounting(hole).penalties, 0),
    pickedUp: completed.filter((hole) => hole.status === 'picked-up').length,
  };
}
