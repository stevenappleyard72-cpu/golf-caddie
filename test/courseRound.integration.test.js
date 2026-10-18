import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { adaptCourseData, getRoundHoles, getScoringProfile } from '../src/courseAdapter.js';
import { createRound, getBallState, getCurrentHole, recordStroke } from '../src/roundEngine.js';
import { simulatedEndpointFromRemainingDistance } from '../src/simulation.js';

const sourceUrl = new URL('../Documents/GolfCaddie_Handover/chislehurst_course/chislehurst-course.json', import.meta.url);
const raw = JSON.parse(fs.readFileSync(sourceUrl, 'utf8'));
const course = adaptCourseData(raw);
const profile = { sex: 'male', targetHandicap: 18, driverDistance: 200, fairwayDistance: 160, teeColour: 'yellow' };
const scoringProfile = getScoringProfile(course, profile.sex, profile.teeColour);
const holes = getRoundHoles(course, profile.teeColour, scoringProfile);

test('real hole 1 coordinates and quality flags flow into the round engine unchanged', () => {
  assert.deepEqual(holes[0].teeOrigin, { latitude: 51.4116622, longitude: 0.0645775 });
  assert.deepEqual(holes[0].greenCentre, { latitude: 51.4147622, longitude: 0.0610465 });
  assert.equal(holes[0].teeQuality, 'inferred_colour_not_verified');
  assert.equal(holes[0].greenQuality, 'centroid_of_osm_polygon_not_field_surveyed');

  let round = createRound({ profile, course, scoringProfile, holes, mode: 'simulation' });
  assert.deepEqual(getBallState(getCurrentHole(round)).position, holes[0].teeOrigin);
  round = recordStroke(round, { endpoint: holes[0].greenCentre, source: 'simulation' });
  assert.deepEqual(round.holes[0].events[0].startPosition, holes[0].teeOrigin);
  assert.equal(round.holes[0].events[0].assessment.endDistanceYards, 0);
});

test('simulation derives a round endpoint without mutating retained course positions', () => {
  const teeBefore = structuredClone(holes[0].teeOrigin);
  const greenBefore = structuredClone(holes[0].greenCentre);
  const endpoint = simulatedEndpointFromRemainingDistance(holes[0].teeOrigin, holes[0].greenCentre, 100);
  assert.notDeepEqual(endpoint, holes[0].teeOrigin);
  assert.notDeepEqual(endpoint, holes[0].greenCentre);
  assert.deepEqual(holes[0].teeOrigin, teeBefore);
  assert.deepEqual(holes[0].greenCentre, greenBefore);
});

test('meeting the simulated distance still misses when the new route is not clear', () => {
  const newRound = () => createRound({ profile, course, scoringProfile, holes, mode: 'simulation' });
  const startDistance = newRound().holes[0].teeOrigin;
  const endpoint = simulatedEndpointFromRemainingDistance(startDistance, holes[0].greenCentre, 0);

  const clear = recordStroke(newRound(), { endpoint, routeEnd: true, source: 'simulation' });
  const blocked = recordStroke(newRound(), { endpoint, routeEnd: false, source: 'simulation' });
  assert.equal(clear.holes[0].events[0].assessment.targetMet, true);
  assert.equal(blocked.holes[0].events[0].assessment.targetMet, false);
});
