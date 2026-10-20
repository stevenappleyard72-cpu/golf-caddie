import assert from 'node:assert/strict';
import test from 'node:test';
import { distanceMetres, distanceYards } from '../src/geo.js';

test('WGS84 geodesic returns zero for the same coordinate', () => {
  const point = { latitude: 51.4, longitude: 0.06 };
  assert.equal(distanceMetres(point, point), 0);
  assert.equal(distanceYards(point, point), 0);
});

test('WGS84 geodesic matches reference distances on equator and meridian', () => {
  assert.ok(Math.abs(distanceMetres(
    { latitude: 0, longitude: 0 },
    { latitude: 0, longitude: 1 }
  ) - 111319.490793) < 0.001);
  assert.ok(Math.abs(distanceMetres(
    { latitude: 0, longitude: 0 },
    { latitude: 1, longitude: 0 }
  ) - 110574.388558) < 0.001);
});

test('golf-course WGS84 distance is symmetric and converted to yards', () => {
  const tee = { latitude: 51.4116622, longitude: 0.0645775 };
  const green = { latitude: 51.4147622, longitude: 0.0610465 };
  const forward = distanceYards(tee, green);
  const reverse = distanceYards(green, tee);
  assert.ok(Math.abs(forward - 463.078735) < 0.001);
  assert.ok(Math.abs(forward - reverse) < 1e-8);
});

test('geodesic follows the short path across the antimeridian', () => {
  const metres = distanceMetres(
    { latitude: 0, longitude: 179.9 },
    { latitude: 0, longitude: -179.9 }
  );
  assert.ok(Math.abs(metres - 22263.898159) < 0.01);
});
