export const SCORING_MODEL_VERSION = 'stableford-candidate-v1';

export function roundHalfUp(value) {
  return Math.floor(Number(value) + 0.5);
}

export function courseHandicap(handicapIndex, slopeRating, courseRating, par) {
  return Number(handicapIndex) * Number(slopeRating) / 113 + (Number(courseRating) - Number(par));
}

export function playingHandicap(handicapIndex, profile) {
  return roundHalfUp(courseHandicap(handicapIndex, profile.slopeRating, profile.courseRating, profile.par));
}

export function strokesReceived(playingHandicapValue, strokeIndex) {
  const handicap = Number(playingHandicapValue);
  const index = Number(strokeIndex);
  if (handicap >= 0) {
    const base = Math.floor(handicap / 18);
    const remainder = handicap % 18;
    return base + (index <= remainder ? 1 : 0);
  }
  const strokesGiven = Math.abs(handicap);
  const base = Math.floor(strokesGiven / 18);
  const remainder = strokesGiven % 18;
  const given = base + (remainder > 0 && index > 18 - remainder ? 1 : 0);
  return given ? -given : 0;
}

export function stablefordPoints({ par, grossStrokes, strokes }) {
  if (grossStrokes == null) return 0;
  const netStrokes = grossStrokes - strokes;
  return Math.max(0, 2 + par - netStrokes);
}

export function compareCandidate(round, handicapIndex) {
  if (!round.scoringProfile?.supported) return null;
  const handicap = playingHandicap(handicapIndex, round.scoringProfile);
  const completed = round.holes.filter((hole) => hole.status === 'finished' || hole.status === 'picked-up');
  const points = completed.reduce((total, hole) => total + stablefordPoints({
    par: hole.par,
    grossStrokes: hole.result?.grossStrokes ?? null,
    strokes: strokesReceived(handicap, hole.strokeIndex),
  }), 0);
  return { handicapIndex, playingHandicap: handicap, points, completedHoles: completed.length };
}

export function estimatePlayingLevel(round) {
  if (!round.scoringProfile?.supported) {
    return { status: 'unavailable', reason: round.scoringProfile?.reason || 'Scoring profile unavailable.' };
  }
  const completedHoles = round.holes.filter((hole) => hole.status === 'finished' || hole.status === 'picked-up').length;
  if (!completedHoles) return { status: 'pending', completedHoles: 0 };

  const candidates = [];
  for (let handicapIndex = -5; handicapIndex <= 54; handicapIndex += 1) {
    candidates.push(compareCandidate(round, handicapIndex));
  }
  const targetPoints = completedHoles * 2;
  const minimumDifference = Math.min(...candidates.map((candidate) => Math.abs(candidate.points - targetPoints)));
  const closest = candidates.filter((candidate) => Math.abs(candidate.points - targetPoints) === minimumDifference);
  const targetHandicapResult = compareCandidate(round, round.profile.targetHandicap);
  return {
    status: 'available',
    modelVersion: SCORING_MODEL_VERSION,
    completedHoles,
    targetPoints,
    candidateLow: closest[0].handicapIndex,
    candidateHigh: closest.at(-1).handicapIndex,
    indicatedHandicap: roundHalfUp((closest[0].handicapIndex + closest.at(-1).handicapIndex) / 2),
    targetHandicapPoints: targetHandicapResult.points,
    pointsLow: closest[0].points,
    pointsHigh: closest.at(-1).points,
    exactTargetMatch: minimumDifference === 0,
    provisional: true,
  };
}
