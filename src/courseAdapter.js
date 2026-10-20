const SUPPORTED_TEES = new Set(['red', 'yellow', 'white']);
const SUPPORTED_SEXES = ['male', 'female'];

function isVerifiedRating(rating) {
  return rating?.verification === 'club_linked_rating_page'
    && Number.isFinite(rating.courseRating)
    && Number.isFinite(rating.slopeRating)
    && Number.isFinite(rating.par);
}

function buildProfile(teeSet, rating) {
  const holeScoringVerified = teeSet.publishedHoleScoringAppliesToSex === rating.sex;
  const ratingVerified = isVerifiedRating(rating);
  const supported = holeScoringVerified && ratingVerified;

  return {
    sex: rating.sex,
    tee: teeSet.colour,
    label: `${rating.sex} / ${teeSet.colour}`,
    supported,
    distanceTrackingAvailable: true,
    reason: supported
      ? null
      : !ratingVerified
        ? 'The course rating is not verified from a club-linked source.'
        : `The ${rating.sex} per-hole par and stroke-index profile is not verified for ${teeSet.colour} tees.`,
    courseRating: rating.courseRating ?? null,
    slopeRating: rating.slopeRating ?? null,
    par: rating.par ?? null,
    verification: rating.verification ?? 'unverified',
    holes: supported
      ? teeSet.holes.map((hole) => ({
          number: hole.number,
          par: hole.par,
          strokeIndex: hole.strokeIndex,
          lengthYards: hole.lengthYards,
        }))
      : null,
  };
}

export function adaptCourseData(rawCourse) {
  if (!rawCourse || !Array.isArray(rawCourse.holes)) {
    throw new Error('Course data is missing holes');
  }

  const teeSets = (rawCourse.teeSets || [])
    .filter((teeSet) => teeSet && SUPPORTED_TEES.has(teeSet.colour) && Array.isArray(teeSet.holes))
    .map((teeSet) => ({
      id: teeSet.id,
      colour: teeSet.colour,
      holes: teeSet.holes,
      ratings: Array.isArray(teeSet.ratings) ? teeSet.ratings : [],
      publishedHoleScoringAppliesToSex: teeSet.publishedHoleScoringAppliesToSex,
      scoringVerification: teeSet.scoringVerification,
    }));

  const profileOptions = [];
  for (const sex of SUPPORTED_SEXES) {
    for (const tee of SUPPORTED_TEES) {
      const teeSet = teeSets.find((candidate) => candidate.colour === tee);
      const rating = teeSet?.ratings.find((candidate) => candidate.sex === sex);
      if (rating) {
        profileOptions.push(buildProfile(teeSet, rating));
      } else {
        profileOptions.push({
          sex,
          tee,
          label: `${sex} / ${tee}`,
          supported: false,
          distanceTrackingAvailable: true,
          reason: `No verified ${sex} rating is available for ${tee} tees.`,
          courseRating: null,
          slopeRating: null,
          par: null,
          verification: 'unavailable',
          holes: null,
        });
      }
    }
  }

  return {
    schemaVersion: rawCourse.schemaVersion,
    id: rawCourse.course?.id || 'unknown-course',
    name: rawCourse.course?.name || 'Unknown course',
    coordinateSystem: rawCourse.course?.coordinateSystem || 'WGS84',
    holes: rawCourse.holes.map((hole) => ({
      number: hole.number,
      greenCentre: hole.greenCentre,
      teePositions: Object.fromEntries(
        Object.entries(hole.teeEstimates || {}).map(([tee, estimate]) => [tee, estimate?.position])
      ),
      teeQuality: Object.fromEntries(
        Object.entries(hole.teeEstimates || {}).map(([tee, estimate]) => [tee, estimate?.status])
      ),
      mappedReferenceTee: hole.mappedReferenceTee,
      greenQuality: hole.greenGeometryStatus,
    })),
    teeSets,
    profileOptions,
    supportedProfiles: profileOptions.filter((profile) => profile.supported),
    quality: rawCourse.dataQuality || {},
    attribution: rawCourse.attribution || {},
    missingData: rawCourse.missingData || [],
  };
}

export function getScoringProfile(course, tee) {
  return course.supportedProfiles.find((profile) => profile.tee === tee) || {
    tee,
    label: tee,
    supported: false,
    distanceTrackingAvailable: true,
    reason: `No verified scoring profile is available for ${tee} tees.`,
    holes: null,
  };
}

export function getRoundHoles(course, tee, scoringProfile = null) {
  const teeSet = course.teeSets.find((candidate) => candidate.colour === tee);
  if (!teeSet) throw new Error(`Tee set ${tee} is unavailable`);

  return course.holes.map((hole) => {
    const teeHole = teeSet.holes.find((candidate) => candidate.number === hole.number);
    const scoringHole = scoringProfile?.supported
      ? scoringProfile.holes.find((candidate) => candidate.number === hole.number)
      : null;
    const teeOrigin = hole.teePositions[tee] || teeHole?.tee || hole.mappedReferenceTee;
    if (!teeOrigin) throw new Error(`Hole ${hole.number} has no usable tee position`);

    return {
      number: hole.number,
      teeOrigin,
      teeQuality: hole.teeQuality[tee] || 'unverified',
      greenCentre: hole.greenCentre,
      greenQuality: hole.greenQuality,
      lengthYards: teeHole?.lengthYards ?? null,
      par: scoringHole?.par ?? null,
      strokeIndex: scoringHole?.strokeIndex ?? null,
    };
  });
}

export function getSupportedProfileSet(rawCourse) {
  return adaptCourseData(rawCourse).supportedProfiles;
}
