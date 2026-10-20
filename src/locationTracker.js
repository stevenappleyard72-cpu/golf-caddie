import { distanceMetres } from './geo.js';

export const DEFAULT_LOCATION_CONFIG = Object.freeze({
  excellentAccuracyMetres: 3,
  goodAccuracyMetres: 5,
  acceptableAccuracyMetres: 10,
  targetAccuracyMetres: 5,
  maxReadyAgeMs: 8000,
  recentWindowMs: 20000,
  historyRetentionMs: 120000,
  settlingPeriodMs: 12000,
  refreshIntervalMs: 5000,
  positionTimeoutMs: 15000,
  minimumFilterSamples: 3,
  maximumFilterSamples: 5,
  stationaryRadiusMetres: 10,
  slowSpeedMetresPerSecond: 1.5,
  accuracyWeightPower: 4,
});

export function locationQuality(accuracy, config = DEFAULT_LOCATION_CONFIG) {
  const value = Number(accuracy);
  if (!Number.isFinite(value)) return 'unknown';
  if (value <= config.excellentAccuracyMetres) return 'excellent';
  if (value <= config.goodAccuracyMetres) return 'good';
  if (value <= config.acceptableAccuracyMetres) return 'acceptable';
  return 'poor';
}

export function normalisePosition(position, receivedAt = Date.now()) {
  const latitude = Number(position?.coords?.latitude);
  const longitude = Number(position?.coords?.longitude);
  const accuracy = Number(position?.coords?.accuracy);
  const timestampMs = Number(position?.timestamp);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || !Number.isFinite(longitude) || longitude < -180 || longitude > 180
    || !Number.isFinite(accuracy) || accuracy < 0
    || !Number.isFinite(timestampMs)) {
    return null;
  }
  return { latitude, longitude, accuracy, timestampMs, receivedAt };
}

function recentFixes(samples, now, config) {
  return samples.filter((fix) => {
    const age = Math.max(0, now - fix.timestampMs);
    return age <= config.recentWindowMs;
  });
}

function stationaryFilter(samples, now, config) {
  const recent = recentFixes(samples, now, config);
  const consecutive = [];
  for (let index = recent.length - 1; index >= 0 && consecutive.length < config.maximumFilterSamples; index -= 1) {
    const fix = recent[index];
    if (fix.accuracy > config.acceptableAccuracyMetres) break;
    consecutive.unshift(fix);
  }
  if (consecutive.length < config.minimumFilterSamples) return null;

  const first = consecutive[0];
  const last = consecutive.at(-1);
  const durationSeconds = Math.max(0.001, (last.timestampMs - first.timestampMs) / 1000);
  const speed = distanceMetres(first, last) / durationSeconds;
  const centre = consecutive.reduce((best, fix) => fix.accuracy < best.accuracy ? fix : best);
  const clustered = consecutive.every((fix) => distanceMetres(fix, centre) <= config.stationaryRadiusMetres);
  if (!clustered || speed > config.slowSpeedMetresPerSecond) return null;

  let latitudeTotal = 0;
  let longitudeTotal = 0;
  let weightTotal = 0;
  for (const fix of consecutive) {
    const weight = 1 / Math.max(0.5, fix.accuracy) ** config.accuracyWeightPower;
    latitudeTotal += fix.latitude * weight;
    longitudeTotal += fix.longitude * weight;
    weightTotal += weight;
  }
  return {
    latitude: latitudeTotal / weightTotal,
    longitude: longitudeTotal / weightTotal,
    accuracy: centre.accuracy,
    timestampMs: last.timestampMs,
    filtered: true,
    sampleCount: consecutive.length,
  };
}

export function selectBestRecentPosition(samples, now = Date.now(), config = DEFAULT_LOCATION_CONFIG) {
  const recent = recentFixes(samples, now, config);
  if (!recent.length) return null;
  const best = recent.reduce((selected, fix) => {
    if (!selected || fix.accuracy < selected.accuracy) return fix;
    if (fix.accuracy === selected.accuracy && fix.timestampMs > selected.timestampMs) return fix;
    return selected;
  }, null);
  const filtered = stationaryFilter(samples, now, config);
  const selected = filtered && filtered.accuracy <= best.accuracy
    ? filtered
    : { ...best, filtered: false, sampleCount: 1 };
  return {
    endpoint: { latitude: selected.latitude, longitude: selected.longitude },
    accuracy: selected.accuracy,
    timestamp: new Date(selected.timestampMs).toISOString(),
    ageMs: Math.max(0, now - selected.timestampMs),
    quality: locationQuality(selected.accuracy, config),
    filtered: selected.filtered,
    sampleCount: selected.sampleCount,
  };
}

export class LocationTracker {
  constructor({ geolocation, permissions = null, config = {}, now = () => Date.now(), onUpdate = () => {} } = {}) {
    this.geolocation = geolocation;
    this.permissions = permissions;
    this.config = Object.freeze({ ...DEFAULT_LOCATION_CONFIG, ...config });
    this.now = now;
    this.onUpdate = onUpdate;
    this.samples = [];
    this.watchId = null;
    this.refreshTimer = null;
    this.refreshPending = false;
    this.permissionState = 'unknown';
    this.lastError = null;
    this.waiters = new Set();
    this.acceptPosition = this.acceptPosition.bind(this);
    this.handleError = this.handleError.bind(this);
  }

  get positionOptions() {
    return { enableHighAccuracy: true, maximumAge: 0, timeout: this.config.positionTimeoutMs };
  }

  async readPermissionState() {
    try {
      if (this.permissions?.query) {
        const status = await this.permissions.query({ name: 'geolocation' });
        this.permissionState = status.state;
        status.onchange = () => {
          this.permissionState = status.state;
          this.emit();
        };
      }
    } catch {
      this.permissionState = 'unknown';
    }
    this.emit();
  }

  start() {
    if (this.watchId != null) return;
    if (!this.geolocation?.watchPosition) throw new Error('GPS is unavailable on this device');
    this.readPermissionState();
    this.watchId = this.geolocation.watchPosition(this.acceptPosition, this.handleError, this.positionOptions);
    this.refreshTimer = globalThis.setInterval(() => this.refreshIfNeeded(), this.config.refreshIntervalMs);
    this.emit();
  }

  stop() {
    if (this.watchId != null) this.geolocation?.clearWatch?.(this.watchId);
    if (this.refreshTimer != null) globalThis.clearInterval(this.refreshTimer);
    this.watchId = null;
    this.refreshTimer = null;
    this.refreshPending = false;
    this.emit();
  }

  refreshIfNeeded() {
    const newest = this.samples.at(-1);
    if (this.refreshPending || (newest && this.now() - newest.receivedAt < this.config.refreshIntervalMs)) return;
    if (!this.geolocation?.getCurrentPosition) return;
    this.refreshPending = true;
    this.geolocation.getCurrentPosition(
      (position) => { this.refreshPending = false; this.acceptPosition(position); },
      (error) => { this.refreshPending = false; this.handleError(error); },
      this.positionOptions
    );
  }

  acceptPosition(position) {
    const fix = normalisePosition(position, this.now());
    if (!fix) return;
    const duplicate = this.samples.some((sample) => sample.timestampMs === fix.timestampMs
      && sample.latitude === fix.latitude && sample.longitude === fix.longitude && sample.accuracy === fix.accuracy);
    if (!duplicate) this.samples.push(fix);
    const cutoff = this.now() - this.config.historyRetentionMs;
    this.samples = this.samples.filter((sample) => sample.timestampMs >= cutoff);
    this.lastError = null;
    this.emit();
    for (const waiter of this.waiters) waiter();
  }

  handleError(error) {
    this.lastError = error;
    this.emit();
    if (error?.code === 1) {
      for (const waiter of this.waiters) waiter(error);
    }
  }

  bestRecent() {
    return selectBestRecentPosition(this.samples, this.now(), this.config);
  }

  status() {
    return {
      active: this.watchId != null,
      permissionState: this.permissionState,
      fix: this.bestRecent(),
      sampleCount: this.samples.length,
      error: this.lastError,
    };
  }

  emit() {
    this.onUpdate(this.status());
  }

  async acquireBestPosition() {
    this.start();
    const ready = this.bestRecent();
    if (ready && ready.ageMs <= this.config.maxReadyAgeMs && ready.accuracy <= this.config.targetAccuracyMetres) {
      return ready;
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error = null) => {
        if (settled) return;
        const candidate = this.bestRecent();
        const excellent = candidate?.accuracy <= this.config.excellentAccuracyMetres;
        const stableGood = candidate?.filtered && candidate.accuracy <= this.config.goodAccuracyMetres;
        if (!error && !excellent && !stableGood) return;
        settled = true;
        globalThis.clearTimeout(timeoutId);
        this.waiters.delete(finish);
        if (error) reject(new Error('Location permission was denied. Enable Precise location for GolfCaddie in Android or Chrome settings.'));
        else resolve(candidate);
      };
      const timeoutId = globalThis.setTimeout(() => {
        if (settled) return;
        settled = true;
        this.waiters.delete(finish);
        const candidate = this.bestRecent();
        if (candidate) resolve(candidate);
        else reject(new Error('No recent GPS position was obtained. Move into the open, keep the screen on, and try again.'));
      }, this.config.settlingPeriodMs);
      this.waiters.add(finish);
      this.refreshIfNeeded();
    });
  }
}
