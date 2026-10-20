const WGS84_MAJOR_AXIS_METRES = 6378137;
const WGS84_FLATTENING = 1 / 298.257223563;
const WGS84_MINOR_AXIS_METRES = (1 - WGS84_FLATTENING) * WGS84_MAJOR_AXIS_METRES;
const MEAN_EARTH_RADIUS_METRES = 6371008.8;
const YARDS_PER_METRE = 1.0936132983377078;

const radians = (degrees) => degrees * Math.PI / 180;

function haversineDistanceMetres(a, b) {
  const latitudeDelta = radians(b.latitude - a.latitude);
  const longitudeDelta = radians(b.longitude - a.longitude);
  const latitudeA = radians(a.latitude);
  const latitudeB = radians(b.latitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(longitudeDelta / 2) ** 2;
  const bounded = Math.max(0, Math.min(1, haversine));
  return MEAN_EARTH_RADIUS_METRES * 2 * Math.atan2(Math.sqrt(bounded), Math.sqrt(1 - bounded));
}

export function distanceMetres(a, b) {
  if (!a || !b) return null;
  const latitude1 = radians(a.latitude);
  const latitude2 = radians(b.latitude);
  const longitudeDifference = radians(b.longitude - a.longitude);
  const reduced1 = Math.atan((1 - WGS84_FLATTENING) * Math.tan(latitude1));
  const reduced2 = Math.atan((1 - WGS84_FLATTENING) * Math.tan(latitude2));
  const sin1 = Math.sin(reduced1);
  const cos1 = Math.cos(reduced1);
  const sin2 = Math.sin(reduced2);
  const cos2 = Math.cos(reduced2);
  let lambda = longitudeDifference;
  let sigma;
  let sinSigma;
  let cosSigma;
  let cosSquaredAlpha;
  let cosDoubleSigmaMidpoint;
  let converged = false;

  for (let iteration = 0; iteration < 100; iteration += 1) {
    const sinLambda = Math.sin(lambda);
    const cosLambda = Math.cos(lambda);
    sinSigma = Math.sqrt((cos2 * sinLambda) ** 2
      + (cos1 * sin2 - sin1 * cos2 * cosLambda) ** 2);
    if (sinSigma === 0) return 0;
    cosSigma = sin1 * sin2 + cos1 * cos2 * cosLambda;
    sigma = Math.atan2(sinSigma, cosSigma);
    const sinAlpha = cos1 * cos2 * sinLambda / sinSigma;
    cosSquaredAlpha = 1 - sinAlpha ** 2;
    cosDoubleSigmaMidpoint = cosSquaredAlpha === 0 ? 0 : cosSigma - 2 * sin1 * sin2 / cosSquaredAlpha;
    const coefficient = WGS84_FLATTENING / 16 * cosSquaredAlpha
      * (4 + WGS84_FLATTENING * (4 - 3 * cosSquaredAlpha));
    const previous = lambda;
    lambda = longitudeDifference + (1 - coefficient) * WGS84_FLATTENING * sinAlpha
      * (sigma + coefficient * sinSigma * (cosDoubleSigmaMidpoint
        + coefficient * cosSigma * (-1 + 2 * cosDoubleSigmaMidpoint ** 2)));
    if (Math.abs(lambda - previous) <= 1e-12) {
      converged = true;
      break;
    }
  }
  if (!converged) return haversineDistanceMetres(a, b);

  const uSquared = cosSquaredAlpha * (WGS84_MAJOR_AXIS_METRES ** 2 - WGS84_MINOR_AXIS_METRES ** 2)
    / WGS84_MINOR_AXIS_METRES ** 2;
  const coefficientA = 1 + uSquared / 16384
    * (4096 + uSquared * (-768 + uSquared * (320 - 175 * uSquared)));
  const coefficientB = uSquared / 1024
    * (256 + uSquared * (-128 + uSquared * (74 - 47 * uSquared)));
  const sigmaCorrection = coefficientB * sinSigma * (cosDoubleSigmaMidpoint
    + coefficientB / 4 * (cosSigma * (-1 + 2 * cosDoubleSigmaMidpoint ** 2)
      - coefficientB / 6 * cosDoubleSigmaMidpoint * (-3 + 4 * sinSigma ** 2)
      * (-3 + 4 * cosDoubleSigmaMidpoint ** 2)));
  return WGS84_MINOR_AXIS_METRES * coefficientA * (sigma - sigmaCorrection);
}

export function distanceYards(a, b) {
  const metres = distanceMetres(a, b);
  return metres == null ? null : metres * YARDS_PER_METRE;
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
