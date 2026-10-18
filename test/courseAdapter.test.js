import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { adaptCourseData, getRoundHoles, getScoringProfile } from '../src/courseAdapter.js';

const raw = JSON.parse(fs.readFileSync(
  new URL('../Documents/GolfCaddie_Handover/chislehurst_course/chislehurst-course.json', import.meta.url),
  'utf8'
));
const course = adaptCourseData(raw);

test('adapts all course coordinates without changing the source schema', () => {
  assert.equal(course.schemaVersion, 2);
  assert.equal(course.holes.length, 18);
  assert.deepEqual(Object.keys(course.holes[0].teePositions).sort(), ['red', 'white', 'yellow']);
  assert.equal(course.holes[0].teeQuality.yellow, 'inferred_colour_not_verified');
});

test('only complete sex and tee scoring profiles are supported', () => {
  assert.deepEqual(
    course.supportedProfiles.map(({ sex, tee }) => `${sex}/${tee}`).sort(),
    ['female/red', 'male/white', 'male/yellow']
  );
  assert.equal(getScoringProfile(course, 'female', 'yellow').supported, false);
  assert.equal(getScoringProfile(course, 'female', 'white').supported, false);
  assert.equal(getScoringProfile(course, 'male', 'red').supported, false);
});

test('unsupported scoring never borrows another sex profile', () => {
  const unsupported = getScoringProfile(course, 'female', 'yellow');
  const holes = getRoundHoles(course, 'yellow', unsupported);
  assert.equal(holes[0].par, null);
  assert.equal(holes[0].strokeIndex, null);
  assert.deepEqual(holes[0].teeOrigin, raw.holes[0].teeEstimates.yellow.position);
});

test('supported profiles provide their verified per-hole scoring data', () => {
  const maleYellow = getScoringProfile(course, 'male', 'yellow');
  const femaleRed = getScoringProfile(course, 'female', 'red');
  assert.equal(maleYellow.supported, true);
  assert.equal(femaleRed.supported, true);
  assert.equal(getRoundHoles(course, 'yellow', maleYellow)[0].strokeIndex, 11);
  assert.equal(getRoundHoles(course, 'red', femaleRed)[0].strokeIndex, 7);
});
