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

test('source adaptation retains only complete verified scoring profiles', () => {
  assert.deepEqual(
    course.supportedProfiles.map(({ sex, tee }) => `${sex}/${tee}`).sort(),
    ['female/red', 'male/white', 'male/yellow']
  );
});

test('Stableford profile selection is based on tee colour alone', () => {
  assert.equal(getScoringProfile(course, 'yellow').sex, 'male');
  assert.equal(getScoringProfile(course, 'red').sex, 'female');
  assert.equal(getScoringProfile(course, 'blue').supported, false);
});

test('supported profiles provide their verified per-hole scoring data', () => {
  const yellow = getScoringProfile(course, 'yellow');
  const red = getScoringProfile(course, 'red');
  assert.equal(yellow.supported, true);
  assert.equal(red.supported, true);
  assert.equal(getRoundHoles(course, 'yellow', yellow)[0].strokeIndex, 11);
  assert.equal(getRoundHoles(course, 'red', red)[0].strokeIndex, 7);
});
