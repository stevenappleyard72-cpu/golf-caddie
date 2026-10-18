import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compareCandidate,
  courseHandicap,
  estimatePlayingLevel,
  playingHandicap,
  stablefordPoints,
  strokesReceived,
} from '../src/scoringModel.js';

test('course and playing handicap use the verified formula and round only at the final step', () => {
  const profile = { slopeRating: 122, courseRating: 71.1, par: 72 };
  assert.equal(Math.round(courseHandicap(20, 122, 71.1, 72) * 10000) / 10000, 20.6929);
  assert.equal(playingHandicap(20, profile), 21);
  assert.equal(strokesReceived(playingHandicap(20, profile), 3), 2);
});

test('stroke allocation repeats above 18 and gives strokes back from SI 18 for plus handicaps', () => {
  assert.equal(strokesReceived(25, 7), 2);
  assert.equal(strokesReceived(25, 8), 1);
  assert.equal(strokesReceived(-2, 18), -1);
  assert.equal(strokesReceived(-2, 17), -1);
  assert.equal(strokesReceived(-2, 16), 0);
});

test('Stableford includes handicap strokes and picked-up holes score zero', () => {
  assert.equal(stablefordPoints({ par: 4, grossStrokes: 5, strokes: 1 }), 2);
  assert.equal(stablefordPoints({ par: 4, grossStrokes: null, strokes: 2 }), 0);
});

test('Chislehurst hole 1 gross five scores three points at target index 12', () => {
  const profile = { slopeRating: 120, courseRating: 64.7, par: 66 };
  const handicap = playingHandicap(12, profile);
  assert.equal(handicap, 11);
  assert.equal(strokesReceived(handicap, 11), 1);
  assert.equal(stablefordPoints({ par: 5, grossStrokes: 5, strokes: 1 }), 3);
});

test('candidate comparison uses actual completed-hole gross scores', () => {
  const round = {
    scoringProfile: { supported: true, slopeRating: 113, courseRating: 72, par: 72 },
    profile: { targetHandicap: 1 },
    holes: [
      { par: 4, strokeIndex: 1, status: 'finished', result: { grossStrokes: 5 } },
      { par: 4, strokeIndex: 18, status: 'finished', result: { grossStrokes: 4 } },
    ],
  };
  assert.equal(compareCandidate(round, 0).points, 3);
  assert.equal(compareCandidate(round, 1).points, 4);
  const estimate = estimatePlayingLevel(round);
  assert.equal(estimate.targetPoints, 4);
  assert.equal(estimate.candidateLow, 1);
  assert.equal(estimate.targetHandicapPoints, 4);
  assert.equal(estimate.indicatedHandicap, 9);
});

test('round scoring ignores strokes on the open hole until that hole is finished', () => {
  const base = {
    scoringProfile: { supported: true, slopeRating: 113, courseRating: 72, par: 72 },
    profile: { targetHandicap: 12 },
    holes: [{ par: 4, strokeIndex: 1, status: 'finished', result: { grossStrokes: 5 } }],
  };
  const before = estimatePlayingLevel(base);
  const duringNextHole = estimatePlayingLevel({
    ...base,
    holes: [...base.holes, { par: 4, strokeIndex: 2, status: 'open', events: [{ type: 'stroke' }, { type: 'stroke' }] }],
  });
  assert.equal(duringNextHole.completedHoles, before.completedHoles);
  assert.equal(duringNextHole.targetHandicapPoints, before.targetHandicapPoints);
  assert.equal(duringNextHole.indicatedHandicap, before.indicatedHandicap);
});

test('playing-level estimate stays unavailable without a complete sex and tee profile', () => {
  const result = estimatePlayingLevel({ scoringProfile: { supported: false, reason: 'unsupported' }, holes: [] });
  assert.deepEqual(result, { status: 'unavailable', reason: 'unsupported' });
});
