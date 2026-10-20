import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_LOCATION_CONFIG,
  LocationTracker,
  locationQuality,
  normalisePosition,
  selectBestRecentPosition,
} from '../src/locationTracker.js';

const fix = (latitude, longitude, accuracy, timestampMs) => ({
  latitude, longitude, accuracy, timestampMs, receivedAt: timestampMs,
});

test('accuracy quality thresholds are configurable and inclusive', () => {
  assert.equal(locationQuality(3), 'excellent');
  assert.equal(locationQuality(5), 'good');
  assert.equal(locationQuality(10), 'acceptable');
  assert.equal(locationQuality(10.1), 'poor');
  assert.equal(locationQuality(6, { ...DEFAULT_LOCATION_CONFIG, goodAccuracyMetres: 6 }), 'good');
});

test('position normalisation retains coordinate, horizontal accuracy and timestamp', () => {
  assert.deepEqual(normalisePosition({
    coords: { latitude: 51.4, longitude: 0.06, accuracy: 4.2 },
    timestamp: 1000,
  }, 1100), {
    latitude: 51.4, longitude: 0.06, accuracy: 4.2, timestampMs: 1000, receivedAt: 1100,
  });
});

test('best recent fix is selected by accuracy rather than arrival order', () => {
  const now = 20000;
  const selected = selectBestRecentPosition([
    fix(51.4, 0.06, 3, 15000),
    fix(51.5, 0.07, 9, 19000),
  ], now);
  assert.deepEqual(selected.endpoint, { latitude: 51.4, longitude: 0.06 });
  assert.equal(selected.accuracy, 3);
  assert.equal(selected.ageMs, 5000);
  assert.equal(selected.quality, 'excellent');
});

test('stale fixes outside the recent window are not selected', () => {
  assert.equal(selectBestRecentPosition([
    fix(51.4, 0.06, 2, 1000),
  ], 30000), null);
});

test('stationary consecutive good fixes use strongly accuracy-weighted filtering', () => {
  const now = 10000;
  const selected = selectBestRecentPosition([
    fix(51.40000, 0.06000, 4, 6000),
    fix(51.40001, 0.06000, 4, 7000),
    fix(51.40002, 0.06000, 2, 8000),
  ], now);
  assert.equal(selected.filtered, true);
  assert.equal(selected.sampleCount, 3);
  assert.equal(selected.accuracy, 2);
  assert.ok(selected.endpoint.latitude > 51.400017);
  assert.ok(selected.endpoint.latitude < 51.40002);
});

test('moving fixes are not averaged together', () => {
  const selected = selectBestRecentPosition([
    fix(51.4000, 0.06, 5, 6000),
    fix(51.4001, 0.06, 5, 7000),
    fix(51.4002, 0.06, 5, 8000),
  ], 10000);
  assert.equal(selected.filtered, false);
  assert.deepEqual(selected.endpoint, { latitude: 51.4002, longitude: 0.06 });
});

test('tracker requests continuous high-accuracy uncached updates and retains fixes', async () => {
  let success;
  let options;
  let cleared = null;
  const geolocation = {
    watchPosition(onSuccess, _onError, suppliedOptions) {
      success = onSuccess;
      options = suppliedOptions;
      return 7;
    },
    clearWatch(id) { cleared = id; },
    getCurrentPosition() {},
  };
  const tracker = new LocationTracker({ geolocation, now: () => 10000 });
  tracker.start();
  assert.deepEqual(options, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
  success({ coords: { latitude: 51.4, longitude: 0.06, accuracy: 4 }, timestamp: 9000 });
  assert.equal(tracker.samples.length, 1);
  assert.equal(tracker.bestRecent().quality, 'good');
  const selected = await tracker.acquireBestPosition();
  assert.equal(selected.accuracy, 4);
  tracker.stop();
  assert.equal(cleared, 7);
});

test('settling ends early after three stable good fixes can be filtered', async () => {
  let success;
  let now = 10000;
  const geolocation = {
    watchPosition(onSuccess) { success = onSuccess; return 8; },
    clearWatch() {},
    getCurrentPosition() {},
  };
  const tracker = new LocationTracker({
    geolocation,
    now: () => now,
    config: { settlingPeriodMs: 1000, refreshIntervalMs: 100000 },
  });
  tracker.start();
  const pending = tracker.acquireBestPosition();
  success({ coords: { latitude: 51.40000, longitude: 0.06, accuracy: 4 }, timestamp: 7000 });
  now = 10500;
  success({ coords: { latitude: 51.40001, longitude: 0.06, accuracy: 4 }, timestamp: 8000 });
  now = 11000;
  success({ coords: { latitude: 51.40002, longitude: 0.06, accuracy: 4 }, timestamp: 9000 });
  const selected = await pending;
  assert.equal(selected.filtered, true);
  assert.equal(selected.sampleCount, 3);
  assert.equal(selected.quality, 'good');
  tracker.stop();
});

test('settling timeout returns the best recent result even when it is poor', async () => {
  let success;
  const geolocation = {
    watchPosition(onSuccess) { success = onSuccess; return 9; },
    clearWatch() {},
    getCurrentPosition() {},
  };
  const tracker = new LocationTracker({
    geolocation,
    now: () => 10000,
    config: { settlingPeriodMs: 5, refreshIntervalMs: 100000 },
  });
  tracker.start();
  const pending = tracker.acquireBestPosition();
  success({ coords: { latitude: 51.4, longitude: 0.06, accuracy: 14 }, timestamp: 9000 });
  const selected = await pending;
  assert.equal(selected.quality, 'poor');
  assert.equal(selected.accuracy, 14);
  tracker.stop();
});

test('five-second heartbeat requests a fresh high-accuracy fix after callbacks stall', () => {
  let now = 10000;
  let refreshOptions;
  const geolocation = {
    watchPosition() { return 10; },
    clearWatch() {},
    getCurrentPosition(_success, _error, options) { refreshOptions = options; },
  };
  const tracker = new LocationTracker({ geolocation, now: () => now });
  tracker.start();
  tracker.acceptPosition({ coords: { latitude: 51.4, longitude: 0.06, accuracy: 5 }, timestamp: 10000 });
  tracker.refreshIfNeeded();
  assert.equal(refreshOptions, undefined);
  now = 15001;
  tracker.refreshIfNeeded();
  assert.deepEqual(refreshOptions, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
  tracker.stop();
});
