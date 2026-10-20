# Android/PWA location model

## Platform boundary

GolfCaddie is an installed web app, not a native Android application. It uses the W3C Geolocation API exposed by Chrome. That API returns WGS84 coordinates but is deliberately agnostic about the underlying provider. `enableHighAccuracy: true` is a request that the browser may honour; it does not give JavaScript direct access to Android's `FusedLocationProviderClient`, `PRIORITY_HIGH_ACCURACY`, a native update interval, or the `ACCESS_FINE_LOCATION` manifest permission.

On Android, the golfer must grant the site location permission and choose **Precise** location. The web permission API reports `prompt`, `granted`, or `denied`; it cannot tell the app whether Android's Precise toggle is enabled.

Direct, guaranteed use of Google's Fused Location Provider would require a native Android or Capacitor wrapper with Play Services Location and `ACCESS_FINE_LOCATION`. That is outside the current PWA architecture.

References:

- W3C Geolocation: https://www.w3.org/TR/geolocation/
- Android location permissions: https://developer.android.com/develop/sensors-and-location/location/permissions
- Android fused location updates: https://developer.android.com/develop/sensors-and-location/location/request-updates

## Active tracking

For an active GPS round while the document is visible, `LocationTracker`:

- starts `watchPosition()` with `enableHighAccuracy: true`, `maximumAge: 0`, and a 15-second acquisition timeout;
- retains every distinct callback's latitude, longitude, horizontal accuracy, acquisition timestamp and receipt time in a rolling two-minute history;
- asks for another uncached high-accuracy position if no callback has arrived for five seconds;
- stops the watch and heartbeat when the page is hidden, the round completes, or the user leaves the round.

The five-second heartbeat is best-effort. The Web Geolocation API does not expose a requested native update interval, and Chrome ultimately controls callback frequency.

## Accuracy classification

Defaults are centralized in `DEFAULT_LOCATION_CONFIG`:

- excellent: 3 m or better;
- good: 5 m or better;
- acceptable: 10 m or better;
- poor: worse than 10 m.

The target is 5 m or better. A poor fix may be recorded only after explicit confirmation, and is excluded from target-success assessment.

## Selection and settling

When recording a position:

1. A fix no more than eight seconds old and accurate to 5 m or better is used immediately.
2. Otherwise, collection continues for up to 12 seconds.
3. An excellent fix may finish settling early.
4. Three to five consecutive acceptable fixes may be filtered if they form a 10 m cluster and imply movement no faster than 1.5 m/s.
5. Filtering uses inverse fourth-power accuracy weights, strongly favouring fixes with lower reported uncertainty. The reported result accuracy remains the best source accuracy rather than claiming an unsupported statistical improvement.
6. If filtering is not justified, the most accurate fix within the last 20 seconds is selected; a newer fix does not replace a better recent fix merely because it arrived later.

The recorded event stores endpoint latitude/longitude, horizontal accuracy, acquisition timestamp, quality, age at selection, whether filtering was used and the number of contributing fixes.

## Distance calculation

Coordinate distances use the Vincenty inverse solution on the WGS84 ellipsoid and are converted from metres to yards. A mean-radius haversine fallback handles rare non-convergence near antipodal points. Tests cover zero distance, equatorial and meridional reference distances, course-scale yardage, symmetry and the antimeridian.
