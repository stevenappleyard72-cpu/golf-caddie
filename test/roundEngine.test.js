import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createRound,
  finishHole,
  getBallState,
  getCurrentHole,
  holeAccounting,
  recordPenaltyShot,
  recordStroke,
  suggestedTotalStrokes,
  undoLastAction,
  validateImportedRound,
} from '../src/roundEngine.js';

const profile = { targetHandicap: 18, teeColour: 'yellow' };
const course = { id: 'test-course', name: 'Test Course', coordinateSystem: 'WGS84' };
const scoringProfile = { supported: true, sex: 'male', tee: 'yellow', courseRating: 65, slopeRating: 120, par: 66 };
const holes = Array.from({ length: 18 }, (_, index) => ({
  number: index + 1,
  teeOrigin: { latitude: 51 + index / 1000, longitude: index / 1000 },
  greenCentre: { latitude: 51.001 + index / 1000, longitude: 0.001 + index / 1000 },
  teeQuality: 'inferred_colour_not_verified',
  greenQuality: 'centroid',
  lengthYards: 300,
  par: 4,
  strokeIndex: index + 1,
}));

const newRound = () => createRound({ profile, course, scoringProfile, holes, mode: 'simulation' });

test('every hole starts at its stored tee coordinate', () => {
  const round = newRound();
  assert.deepEqual(getBallState(getCurrentHole(round)).position, holes[0].teeOrigin);
  const afterFinish = finishHole(round, { totalStrokes: 1, putts: 0 });
  assert.equal(getCurrentHole(afterFinish).number, 2);
  assert.deepEqual(getBallState(getCurrentHole(afterFinish)).position, holes[1].teeOrigin);
});

test('suggested gross total adds aggregate putts to recorded shots and penalties', () => {
  let round = recordStroke(newRound(), { endpoint: { latitude: 51.0002, longitude: 0.0002 } });
  round = recordStroke(round, { endpoint: { latitude: 51.0005, longitude: 0.0005 } });
  round = recordStroke(round, { endpoint: { latitude: 51.0008, longitude: 0.0008 } });
  assert.equal(suggestedTotalStrokes(getCurrentHole(round), 2), 5);
});

test('stroke endpoints preserve route state and use the previous endpoint as the next start', () => {
  let round = newRound();
  const first = { latitude: 51.0004, longitude: 0.0003 };
  const second = { latitude: 51.0008, longitude: 0.0008 };
  round = recordStroke(round, { endpoint: first, routeEnd: false });
  round = recordStroke(round, { endpoint: second, routeEnd: true });
  const events = getCurrentHole(round).events;
  assert.deepEqual(events[0].startPosition, holes[0].teeOrigin);
  assert.deepEqual(events[0].endpoint, first);
  assert.equal(events[0].assessment.modelVersion, 'expected-distance-lookup-v1');
  assert.equal(events[0].assessment.context, 'tee-shot');
  assert.equal(typeof events[0].assessment.targetMet, 'boolean');
  assert.equal(events[1].routeStart, false);
  assert.deepEqual(events[1].startPosition, first);
  assert.equal(events[1].assessment.context, 'recovery');
});

test('GPS strokes retain coordinate accuracy, timestamp and selection metadata', () => {
  const endpoint = { latitude: 51.0004, longitude: 0.0003 };
  const round = recordStroke(newRound(), {
    endpoint,
    accuracy: 3.4,
    timestamp: '2026-10-20T10:00:00.000Z',
    source: 'gps',
    locationQuality: 'good',
    locationAgeMs: 850,
    locationFiltered: true,
    locationSampleCount: 4,
  });
  const event = round.holes[0].events[0];
  assert.deepEqual(event.endpoint, endpoint);
  assert.equal(event.accuracy, 3.4);
  assert.equal(event.timestamp, '2026-10-20T10:00:00.000Z');
  assert.deepEqual(event.location, {
    quality: 'good', ageMs: 850, filtered: true, sampleCount: 4,
  });
  assert.deepEqual(getBallState(round.holes[0]).location, event.location);
});

test('simple penalty action records the shot endpoint and one penalty in one undoable action', () => {
  const endpoint = { latitude: 51.0004, longitude: 0.0003 };
  const round = recordPenaltyShot(newRound(), { endpoint, routeEnd: false, source: 'simulation' });
  const hole = getCurrentHole(round);
  assert.deepEqual(hole.events.map((event) => event.type), ['stroke', 'penalty']);
  assert.deepEqual(hole.events[0].endpoint, endpoint);
  assert.deepEqual(hole.events[1].dropPosition, endpoint);
  assert.deepEqual(holeAccounting(hole), { strokes: 1, penalties: 1, assessedStrokes: 1, eventTotal: 2 });
  assert.deepEqual(getBallState(hole).position, endpoint);
  assert.equal(round.undoHistory.length, 1);
  assert.equal(getCurrentHole(undoLastAction(round)).events.length, 0);
});

test('finish stores manual correction, advances, and undo restores the open hole', () => {
  let round = recordStroke(newRound(), { endpoint: holes[0].greenCentre, routeEnd: true });
  round = recordPenaltyShot(round, { endpoint: holes[0].greenCentre, routeEnd: true });
  round = finishHole(round, { totalStrokes: 5, putts: 2 });
  assert.equal(round.holes[0].result.correction, 0);
  assert.equal(round.currentHoleIndex, 1);
  round = undoLastAction(round);
  assert.equal(round.currentHoleIndex, 0);
  assert.equal(round.holes[0].status, 'open');
  assert.equal(round.holes[0].events.length, 3);
});

test('finish correction excludes aggregate putts and records only the manual difference', () => {
  let round = recordStroke(newRound(), { endpoint: holes[0].greenCentre, routeEnd: true });
  round = finishHole(round, { totalStrokes: 4, putts: 2 });
  assert.equal(round.holes[0].result.eventTotal, 1);
  assert.equal(round.holes[0].result.correction, 1);
});

test('picked-up holes advance without inventing a gross score', () => {
  const round = finishHole(newRound(), { pickedUp: true, putts: 0 });
  assert.equal(round.holes[0].status, 'picked-up');
  assert.equal(round.holes[0].result.grossStrokes, null);
  assert.equal(round.currentHoleIndex, 1);
});

test('a full 18-hole flow completes and can undo the final finish', () => {
  let round = newRound();
  for (let index = 0; index < 18; index += 1) {
    round = recordStroke(round, { endpoint: round.holes[index].greenCentre, routeEnd: true });
    round = finishHole(round, { totalStrokes: 3, putts: 1 });
  }
  assert.equal(round.status, 'completed');
  assert.equal(round.currentHoleIndex, 18);
  round = undoLastAction(round);
  assert.equal(round.status, 'active');
  assert.equal(round.currentHoleIndex, 17);
  assert.equal(round.holes[17].status, 'open');
});

test('exported JSON validates for import and rejects another course', () => {
  const exported = JSON.parse(JSON.stringify(newRound()));
  exported.profile.age = 72;
  exported.profile.sex = 'male';
  exported.profile.driverDistance = 205;
  exported.profile.fairwayDistance = 165;
  exported.scoringProfile.sex = 'male';
  const imported = validateImportedRound(exported, 'test-course');
  assert.equal(imported.id, exported.id);
  assert.equal('age' in imported.profile, false);
  assert.equal('sex' in imported.profile, false);
  assert.equal('driverDistance' in imported.profile, false);
  assert.equal('fairwayDistance' in imported.profile, false);
  assert.equal('sex' in imported.scoringProfile, false);
  assert.throws(() => validateImportedRound(exported, 'another-course'), /different course/);
});

test('schema-v1 rounds migrate without inventing assessments for historical shots', () => {
  const legacy = JSON.parse(JSON.stringify(newRound()));
  legacy.schemaVersion = 1;
  delete legacy.benchmarkModelVersion;
  legacy.profile.age = 70;
  legacy.holes[0].events.push({ type: 'stroke', endpoint: holes[0].greenCentre });
  const migrated = validateImportedRound(legacy, 'test-course');
  assert.equal(migrated.schemaVersion, 2);
  assert.equal(migrated.benchmarkModelVersion, 'expected-distance-lookup-v1');
  assert.equal(migrated.holes[0].events[0].assessmentStatus, 'legacy_unassessed');
  assert.equal('age' in migrated.profile, false);
});

test('review checkpoint survives export/resume across shot, penalty, finish, advance and undo', () => {
  let round = newRound();
  round = recordStroke(round, {
    endpoint: { latitude: 51.0005, longitude: 0.0004 },
    routeEnd: false,
  });
  round = recordPenaltyShot(round, {
    endpoint: { latitude: 51.00045, longitude: 0.00035 },
    routeEnd: true,
  });
  round = finishHole(round, { totalStrokes: 5, putts: 1 });
  assert.equal(round.currentHoleIndex, 1);
  assert.deepEqual(getBallState(getCurrentHole(round)).position, holes[1].teeOrigin);

  const resumed = validateImportedRound(JSON.parse(JSON.stringify(round)), 'test-course');
  assert.equal(resumed.holes[0].result.grossStrokes, 5);
  assert.equal(holeAccounting(resumed.holes[0]).penalties, 1);

  const undone = undoLastAction(resumed);
  assert.equal(undone.currentHoleIndex, 0);
  assert.equal(undone.holes[0].status, 'open');
  assert.deepEqual(holeAccounting(undone.holes[0]), {
    strokes: 2,
    penalties: 1,
    assessedStrokes: 2,
    eventTotal: 3,
  });
});
