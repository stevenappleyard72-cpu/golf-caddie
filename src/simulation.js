import { distanceYards } from './geo.js';

export function interpolatePosition(from, to, fraction) {
  return {
    latitude: from.latitude + (to.latitude - from.latitude) * fraction,
    longitude: from.longitude + (to.longitude - from.longitude) * fraction,
  };
}

export function simulatedEndpointFromRemainingDistance(from, green, remainingYards) {
  const targetRemaining = Number(remainingYards);
  if (!Number.isFinite(targetRemaining) || targetRemaining < 0 || targetRemaining > 2000) {
    throw new Error('Distance from the green must be between 0 and 2,000 yards');
  }
  if (targetRemaining === 0) return { ...green };

  const startDistance = distanceYards(from, green);
  if (startDistance < 0.01) {
    return { latitude: green.latitude - targetRemaining / 121_393, longitude: green.longitude };
  }

  let inside = 0;
  let outside = Math.max(1, targetRemaining / startDistance * 1.05);
  while (distanceYards(interpolatePosition(green, from, outside), green) < targetRemaining) outside *= 2;
  for (let index = 0; index < 40; index += 1) {
    const scale = (inside + outside) / 2;
    const remaining = distanceYards(interpolatePosition(green, from, scale), green);
    if (remaining < targetRemaining) inside = scale;
    else outside = scale;
  }
  return interpolatePosition(green, from, outside);
}

