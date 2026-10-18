import assert from 'node:assert/strict';
import test from 'node:test';
import { assessShotOutcome, createShotGoal, targetParameters } from '../src/benchmarkModel.js';

const base = {
  routeClear: true,
  isTeeShot: true,
  driverDistance: 150,
  fairwayDistance: 120,
  targetHandicap: 12,
};

test('stated distance capability is never inflated', () => {
  const goal = createShotGoal({ ...base, startDistanceYards: 300 });
  assert.equal(goal.capabilityYards, 150);
  assert.ok(goal.requiredProgressYards <= 150);
});

test('the previously impossible 142.2-yard demand is replaced by a reachable goal', () => {
  const goal = createShotGoal({ ...base, startDistanceYards: 190, driverDistance: 120 });
  assert.equal(goal.capabilityYards, 120);
  assert.equal(goal.requiredProgressYards, 103.2);
  assert.ok(goal.requiredProgressYards <= goal.capabilityYards);
});

test('a poor 70-yard drive is reported factually and misses its goal without a handicap label', () => {
  const goal = createShotGoal({ ...base, startDistanceYards: 220, driverDistance: 240 });
  const result = assessShotOutcome({
    goal,
    endDistanceYards: 150,
    shotDistanceYards: 72,
    routeEnd: true,
  });
  assert.equal(result.progressYards, 70);
  assert.equal(result.targetMet, false);
  assert.equal(result.handicapBand, null);
});

test('a 25-yard shot to green centre is successful short-approach context, not a handicap claim', () => {
  const goal = createShotGoal({ ...base, isTeeShot: false, startDistanceYards: 25, fairwayDistance: 180 });
  const result = assessShotOutcome({ goal, endDistanceYards: 0, shotDistanceYards: 25, routeEnd: true });
  assert.equal(goal.context, 'short-approach');
  assert.equal(result.targetMet, true);
  assert.equal(result.handicapBand, null);
});

test('backwards movement has one unambiguous sign and recovery can still succeed', () => {
  const goal = createShotGoal({ ...base, routeClear: false, isTeeShot: false, startDistanceYards: 60 });
  const result = assessShotOutcome({ goal, endDistanceYards: 80, shotDistanceYards: 30, routeEnd: true });
  assert.equal(result.progressYards, -20);
  assert.equal(result.direction, 'backward');
  assert.equal(result.routeChange, 'improved');
  assert.equal(result.targetMet, true);
});

test('ending blocked cannot improve a clear-route target result', () => {
  const goal = createShotGoal({ ...base, startDistanceYards: 140, isTeeShot: false });
  const result = assessShotOutcome({ goal, endDistanceYards: 10, shotDistanceYards: 135, routeEnd: false });
  assert.equal(result.routeChange, 'worsened');
  assert.equal(result.targetMet, false);
});

test('higher target handicaps make goals more forgiving through documented provisional parameters', () => {
  const low = createShotGoal({ ...base, startDistanceYards: 250, targetHandicap: 12 });
  const high = createShotGoal({ ...base, startDistanceYards: 250, targetHandicap: 30 });
  assert.ok(low.maximumEndDistanceYards < high.maximumEndDistanceYards);
  assert.ok(targetParameters(12).terminalRadiusYards < targetParameters(30).terminalRadiusYards);
});

test('low-accuracy accepted GPS fixes remain stored but do not affect target success', () => {
  const goal = createShotGoal({ ...base, startDistanceYards: 140 });
  const result = assessShotOutcome({ goal, endDistanceYards: 20, shotDistanceYards: 125, routeEnd: true, accuracyMetres: 30 });
  assert.equal(result.assessmentStatus, 'unassessed_low_accuracy');
  assert.equal(result.targetMet, null);
});
