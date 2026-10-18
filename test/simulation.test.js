import assert from 'node:assert/strict';
import test from 'node:test';
import { distanceYards } from '../src/geo.js';
import { simulatedEndpointFromRemainingDistance } from '../src/simulation.js';

const tee = { latitude: 51.4116622, longitude: 0.0645775 };
const green = { latitude: 51.4147622, longitude: 0.0610465 };

test('simulation converts entered remaining yards into an endpoint for the shared engine', () => {
  const startDistance = distanceYards(tee, green);
  const closer = simulatedEndpointFromRemainingDistance(tee, green, 200);
  const farther = simulatedEndpointFromRemainingDistance(tee, green, startDistance + 50);
  assert.ok(Math.abs(distanceYards(closer, green) - 200) < 0.01);
  assert.ok(Math.abs(distanceYards(farther, green) - (startDistance + 50)) < 0.01);
});
