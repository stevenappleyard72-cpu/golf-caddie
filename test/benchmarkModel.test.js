import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { assessShotOutcome, createShotGoal, expectedEndDistance } from '../src/benchmarkModel.js';
import { EXPECTED_DISTANCE_LOOKUP, EXPECTED_DISTANCE_YARDS } from '../src/expectedDistanceLookup.js';

const base = { routeClear: true, isTeeShot: true, targetHandicap: 12 };

test('runtime lookup data remains identical to the supplied CSV', () => {
  const csv = fs.readFileSync(new URL('../docs/golf_expected_distance_lookup.csv', import.meta.url), 'utf8').trim();
  const [header, ...rows] = csv.split('\n').map((line) => line.split(','));
  assert.deepEqual(EXPECTED_DISTANCE_YARDS, header.slice(1).map((label) => Number(label.replace(' yd', ''))));
  assert.deepEqual(EXPECTED_DISTANCE_LOOKUP, rows.map(([handicap, ...values]) => ({
    handicap: Number(handicap),
    expectedEndDistances: values.map(Number),
  })));
});

test('exact distance and handicap values come directly from the lookup table', () => {
  assert.equal(expectedEndDistance(100, 12), 17.7);
  assert.equal(expectedEndDistance(300, 36), 96.1);
});

test('distance and decimal-handicap values interpolate between table cells', () => {
  assert.equal(expectedEndDistance(105, 12), 18.2);
  assert.equal(expectedEndDistance(100, 12.5), 18);
});

test('values outside the table use documented boundary behaviour', () => {
  assert.equal(expectedEndDistance(5, 12), 1.5);
  assert.equal(expectedEndDistance(350, 12), 102.4);
  assert.equal(expectedEndDistance(100, -5), 10.3);
  assert.equal(expectedEndDistance(100, 54), 30.9);
});

test('shot goal depends on current distance and target handicap, not route or shot type', () => {
  const tee = createShotGoal({ ...base, startDistanceYards: 200 });
  const recovery = createShotGoal({ ...base, startDistanceYards: 200, routeClear: false, isTeeShot: false });
  assert.equal(tee.maximumEndDistanceYards, 30.3);
  assert.equal(recovery.maximumEndDistanceYards, tee.maximumEndDistanceYards);
  assert.equal(tee.requiredProgressYards, 169.7);
  assert.equal(tee.lookupSource, 'docs/golf_expected_distance_lookup.csv');
});

test('higher target handicaps use the more forgiving lookup result', () => {
  const low = createShotGoal({ ...base, startDistanceYards: 250, targetHandicap: 0 });
  const high = createShotGoal({ ...base, startDistanceYards: 250, targetHandicap: 30 });
  assert.ok(low.maximumEndDistanceYards < high.maximumEndDistanceYards);
});

test('target success compares endpoint distance with the stored lookup goal', () => {
  const goal = createShotGoal({ ...base, startDistanceYards: 100 });
  const metBlocked = assessShotOutcome({ goal, endDistanceYards: 17, shotDistanceYards: 85, routeEnd: false });
  const missed = assessShotOutcome({ goal, endDistanceYards: 18, shotDistanceYards: 84, routeEnd: true });
  assert.equal(metBlocked.targetMet, true);
  assert.equal(missed.targetMet, false);
});

test('factual route and backwards movement reporting remains available', () => {
  const goal = createShotGoal({ ...base, routeClear: false, isTeeShot: false, startDistanceYards: 60 });
  const result = assessShotOutcome({ goal, endDistanceYards: 80, shotDistanceYards: 30, routeEnd: true });
  assert.equal(result.progressYards, -20);
  assert.equal(result.direction, 'backward');
  assert.equal(result.routeChange, 'improved');
  assert.equal(result.targetMet, false);
});

test('low-accuracy accepted GPS fixes remain stored but do not affect target success', () => {
  const goal = createShotGoal({ ...base, startDistanceYards: 140 });
  const result = assessShotOutcome({ goal, endDistanceYards: 20, shotDistanceYards: 125, routeEnd: true, accuracyMetres: 30 });
  assert.equal(result.assessmentStatus, 'unassessed_low_accuracy');
  assert.equal(result.targetMet, null);
});

test('fixes worse than the configured acceptable threshold are not assessed', () => {
  const goal = createShotGoal({ ...base, startDistanceYards: 140 });
  const acceptable = assessShotOutcome({ goal, endDistanceYards: 20, shotDistanceYards: 125, routeEnd: true, accuracyMetres: 10 });
  const poor = assessShotOutcome({ goal, endDistanceYards: 20, shotDistanceYards: 125, routeEnd: true, accuracyMetres: 10.1 });
  assert.equal(acceptable.assessmentStatus, 'assessed');
  assert.equal(poor.assessmentStatus, 'unassessed_low_accuracy');
});
