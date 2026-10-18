const EARTH_RADIUS_METRES = 6371008.8;
const YARDS_PER_METRE = 1.0936133;

const radians = (degrees) => degrees * Math.PI / 180;

export function distanceYards(a, b) {
  if (!a || !b) return null;
  const latitudeDelta = radians(b.latitude - a.latitude);
  const longitudeDelta = radians(b.longitude - a.longitude);
  const latitudeA = radians(a.latitude);
  const latitudeB = radians(b.latitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(longitudeDelta / 2) ** 2;
  const metres = EARTH_RADIUS_METRES * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  return metres * YARDS_PER_METRE;
}

export function formatCoordinate(position) {
  return `${position.latitude.toFixed(6)}, ${position.longitude.toFixed(6)}`;
}

export function hasPassedGreen(start, end, green) {
  const latitudeScale = Math.cos(radians((start.latitude + green.latitude) / 2));
  const greenX = (green.longitude - start.longitude) * latitudeScale;
  const greenY = green.latitude - start.latitude;
  const endX = (end.longitude - start.longitude) * latitudeScale;
  const endY = end.latitude - start.latitude;
  const greenLengthSquared = greenX ** 2 + greenY ** 2;
  if (greenLengthSquared === 0) return false;
  return (endX * greenX + endY * greenY) / greenLengthSquared > 1;
}
