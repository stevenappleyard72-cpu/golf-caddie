import './style.css';
import { adaptCourseData, getRoundHoles, getScoringProfile } from './courseAdapter.js';
import {
  createRound,
  finishHole,
  getBallState,
  getCurrentHole,
  holeAccounting,
  recordPenaltyShot,
  recordStroke,
  roundSummary,
  suggestedTotalStrokes,
  undoLastAction,
  validateImportedRound,
  validateProfile,
} from './roundEngine.js';
import { distanceYards, formatCoordinate } from './geo.js';
import { simulatedEndpointFromRemainingDistance } from './simulation.js';
import { clearRound, loadProfile, loadRound, saveProfile, saveRound } from './storage.js';
import { createShotGoal, targetProgress } from './benchmarkModel.js';
import { estimatePlayingLevel, holeScorecard } from './scoringModel.js';

const app = document.querySelector('#app');
const state = {
  course: null,
  profile: null,
  round: null,
  message: '',
  error: '',
  busy: false,
  offlineReady: false,
  installPrompt: null,
};

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

async function loadCourse() {
  const response = await fetch('/api/course');
  if (!response.ok) throw new Error('Course data is unavailable');
  const payload = await response.json();
  if (!payload.ok) throw new Error(payload.error || 'Course data is unavailable');
  return adaptCourseData(payload.course);
}

function setNotice(message = '', error = '') {
  state.message = message;
  state.error = error;
}

function profileDefaults() {
  return state.profile || {
    sex: 'male',
    targetHandicap: 18,
    driverDistance: 200,
    fairwayDistance: 160,
    teeColour: 'yellow',
  };
}

function scoringNotice(profile) {
  if (profile.supported) {
    return `<p class="notice success">Stableford scoring is available for this sex and tee.</p>`;
  }
  return `<p class="notice warning"><strong>Distance tracking remains available.</strong> Scoring estimate unavailable: ${escapeHtml(profile.reason)}</p>`;
}

function statusMessages() {
  return `${state.message ? `<div class="toast success" role="status">${escapeHtml(state.message)}</div>` : ''}${state.error ? `<div class="toast error" role="alert">${escapeHtml(state.error)}</div>` : ''}`;
}

function offlineStatusMarkup() {
  const isOffline = navigator.onLine === false;
  const label = isOffline
    ? (state.offlineReady ? 'Offline · saved copy active' : 'Offline · cache unavailable')
    : (state.offlineReady ? 'Offline copy ready' : 'Preparing offline copy');
  return `<span id="offline-status" class="offline-status ${isOffline ? 'is-offline' : ''}">${label}</span>`;
}

function isInstalledApp() {
  return window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
}

function installActionMarkup() {
  if (isInstalledApp()) return '<span class="installed-status">Installed app</span>';
  return '<button type="button" class="install-button secondary" data-action="install">Install GolfCaddie</button>';
}

function updateOfflineStatus() {
  const element = document.querySelector('#offline-status');
  if (!element) return;
  const isOffline = navigator.onLine === false;
  element.classList.toggle('is-offline', isOffline);
  element.textContent = isOffline
    ? (state.offlineReady ? 'Offline · saved copy active' : 'Offline · cache unavailable')
    : (state.offlineReady ? 'Offline copy ready' : 'Preparing offline copy');
}

function renderStartup() {
  const profile = profileDefaults();
  const scoring = getScoringProfile(state.course, profile.sex, profile.teeColour);
  const canResume = state.round?.status === 'active';
  app.innerHTML = `
    <main class="app-shell startup-shell">
      <header class="hero">
        <div>
          <p class="eyebrow">Chislehurst Golf Club · GolfCaddie</p>
          <h1>Start your round</h1>
          <p class="lede">Your phone owns the round. GPS, scoring inputs and saved progress stay on this device.</p>
          <div class="app-status-row">${offlineStatusMarkup()}${installActionMarkup()}</div>
        </div>
        <span class="course-mark" aria-hidden="true">⛳</span>
      </header>
      ${statusMessages()}
      ${canResume ? `
        <section class="resume-card">
          <div><strong>Round in progress</strong><span>Hole ${state.round.currentHoleIndex + 1} · saved ${new Date(state.round.updatedAt).toLocaleString()}</span></div>
          <button type="button" data-action="resume">Resume round</button>
        </section>` : ''}
      <form id="profile-form" class="card form-card">
        <div class="section-heading"><div><p class="step">Player setup</p><h2>Your playing target</h2></div></div>
        <div class="form-grid">
          <label>Sex
            <select name="sex" required>
              <option value="male" ${profile.sex === 'male' ? 'selected' : ''}>Male</option>
              <option value="female" ${profile.sex === 'female' ? 'selected' : ''}>Female</option>
            </select>
          </label>
          <label>Target Handicap Index
            <input name="targetHandicap" type="number" min="-10" max="54" step="0.1" value="${profile.targetHandicap}" required>
          </label>
          <label>Typical driver distance <span>yards, total</span>
            <input name="driverDistance" type="number" min="1" max="400" step="1" value="${profile.driverDistance}" required>
          </label>
          <label>Longest reliable fairway shot <span>yards, total</span>
            <input name="fairwayDistance" type="number" min="1" max="350" step="1" value="${profile.fairwayDistance}" required>
          </label>
          <label>Tee colour
            <select name="teeColour" required>
              ${['red', 'yellow', 'white'].map((tee) => `<option value="${tee}" ${profile.teeColour === tee ? 'selected' : ''}>${tee[0].toUpperCase()}${tee.slice(1)}</option>`).join('')}
            </select>
          </label>
          <label>Round input
            <select name="mode">
              <option value="simulation">Simulation</option>
              <option value="gps">Phone GPS</option>
            </select>
            <span>GPS is requested only when you record a ball position.</span>
          </label>
        </div>
        <div id="scoring-notice">${scoringNotice(scoring)}</div>
        <button class="primary wide" type="submit">Start new round</button>
      </form>
      <section class="card data-note">
        <h2>Course data status</h2>
        <p>Green centres are mapped polygon centroids. Tee colours are provisional estimates, not verified markers. Scorecard distance and straight-line GPS distance can differ.</p>
        <a href="${escapeHtml(state.course.attribution.url)}" target="_blank" rel="noreferrer">${escapeHtml(state.course.attribution.text)} · ${escapeHtml(state.course.attribution.licence)}</a>
      </section>
      <section class="utility-row">
        <label class="file-button">Import round JSON<input id="import-file" type="file" accept="application/json,.json"></label>
      </section>
    </main>`;
}

function eventDescription(event, strokeNumber) {
  if (event.type === 'stroke') {
    const result = event.assessment;
    const target = result?.targetMet == null ? 'target not assessed' : result.targetMet ? 'target met' : 'target missed';
    return event.endpoint
      ? `<strong>Stroke ${strokeNumber}</strong><span>${result ? `${result.shotDistanceYards} yd played · ${result.progressYards >= 0 ? '+' : ''}${result.progressYards} yd progress · ${target}` : 'legacy shot · unassessed'} · ${event.routeStart ? 'clear' : 'recovery'} → ${event.routeEnd ? 'clear' : 'recovery'}${event.accuracy != null ? ` · ±${Math.round(event.accuracy)}m` : ''}</span>`
      : `<strong>Stroke ${strokeNumber}</strong><span>Endpoint unknown · unassessed</span>`;
  }
  return `<strong>Penalty +${event.penaltyStrokes}</strong><span>Added at the recorded ball position</span>`;
}

function currentShotGoal(round, hole, ball) {
  return createShotGoal({
    startDistanceYards: distanceYards(ball.position, hole.greenCentre),
    routeClear: ball.routeClear,
    isTeeShot: !hole.events.some((event) => event.type === 'stroke'),
    driverDistance: round.profile.driverDistance,
    fairwayDistance: round.profile.fairwayDistance,
    targetHandicap: round.profile.targetHandicap,
  });
}

function goalMarkup(goal) {
  if (goal.kind === 'recovery') {
    return `<strong>Next goal</strong><span>Regain a clear route. No precise yardage is invented from the route flag alone.</span>`;
  }
  return `<strong>Next goal</strong><span>Finish within ${Math.round(goal.maximumEndDistanceYards)} yd of the green.</span>`;
}

function lastShotMarkup(hole) {
  const event = [...hole.events].reverse().find((candidate) => candidate.type === 'stroke');
  if (!event) return '<strong>Last shot</strong><span>Pending first endpoint.</span>';
  if (!event.endpoint) return '<strong>Last shot</strong><span>Endpoint unknown; counted but not assessed.</span>';
  if (!event.assessment) return '<strong>Last shot</strong><span>Legacy event; no retrospective assessment was invented.</span>';
  const result = event.assessment;
  const direction = result.direction === 'forward'
    ? `${result.progressYards} yd progress`
    : result.direction === 'backward'
      ? `${Math.abs(result.progressYards)} yd farther from centre`
      : 'no material radial progress';
  const target = result.targetMet == null ? 'Target result withheld because GPS accuracy was poor.' : result.targetMet ? 'Target met.' : 'Target missed.';
  const route = result.routeChange === 'improved' ? ' Route restored.' : result.routeChange === 'worsened' ? ' Route became blocked.' : '';
  const overshoot = result.passedGreen ? ' Endpoint passed the green-centre plane.' : '';
  return `<strong>Last shot</strong><span>${result.shotDistanceYards} yd played; ${direction}; ${result.endDistanceYards} yd remaining.${route}${overshoot} ${target}</span>`;
}

function roundScoreMarkup(round) {
  const estimate = estimatePlayingLevel(round);
  if (estimate.status !== 'available') return '';
  const holes = `${estimate.completedHoles} hole${estimate.completedHoles === 1 ? '' : 's'}`;
  return `<div><strong>Round progress after ${holes}</strong><span>Stableford at your target handicap: ${estimate.targetHandicapPoints} point${estimate.targetHandicapPoints === 1 ? '' : 's'}.<br>Your score indicates about a ${estimate.indicatedHandicap} handicap so far.</span></div>`;
}

function scorecardMarkup(round) {
  const rows = holeScorecard(round);
  const completed = rows.filter((row) => row.completed);
  const totals = completed.reduce((total, row) => ({
    recordedShots: total.recordedShots + (row.recordedShots ?? 0),
    putts: total.putts + (row.putts ?? 0),
    grossStrokes: total.grossStrokes + (row.grossStrokes ?? 0),
    stablefordPoints: total.stablefordPoints + (row.stablefordPoints ?? 0),
    targetMet: total.targetMet + row.targetMet,
    targetAssessed: total.targetAssessed + row.targetAssessed,
  }), { recordedShots: 0, putts: 0, grossStrokes: 0, stablefordPoints: 0, targetMet: 0, targetAssessed: 0 });
  const scoringAvailable = Boolean(round.scoringProfile?.supported);
  const handicapEstimate = estimatePlayingLevel(round);
  const indicativeHandicap = handicapEstimate.status === 'available'
    ? handicapEstimate.indicatedHandicap
    : '—';
  const value = (item) => item == null ? '—' : item;

  return `
    <section class="card scorecard-card" aria-labelledby="scorecard-heading">
      <div class="section-heading scorecard-heading">
        <div><p class="step">Round detail</p><h2 id="scorecard-heading">Hole-by-hole scorecard</h2></div>
        <span class="scorecard-key">Target = met / assessed</span>
      </div>
      <div class="scorecard-list">
        ${completed.length ? completed.map((row) => `
          <article class="scorecard-hole">
            <h3>Hole ${row.number}<span>${row.par == null ? '' : `Par ${row.par}`}</span></h3>
            <dl>
              <div><dt>Stroke index</dt><dd>${value(row.strokeIndex)}</dd></div>
              <div><dt>Recorded shots</dt><dd>${value(row.recordedShots)}</dd></div>
              <div><dt>Putts</dt><dd>${value(row.putts)}</dd></div>
              <div><dt>Score</dt><dd>${row.pickedUp ? 'PU' : value(row.grossStrokes)}</dd></div>
              <div><dt>Handicap shots</dt><dd>${value(row.handicapStrokes)}</dd></div>
              <div><dt>Stableford points</dt><dd>${value(row.stablefordPoints)}</dd></div>
              <div class="target-result"><dt>Shots within target</dt><dd>${row.targetMet}/${row.targetAssessed}</dd></div>
            </dl>
          </article>`).join('') : '<p class="scorecard-empty">Completed holes will appear here.</p>'}
      </div>
      <div class="scorecard-totals" aria-label="Scorecard totals">
        <strong>Total · ${completed.length} holes</strong>
        <span>Shots <b>${totals.recordedShots}</b></span>
        <span>Putts <b>${totals.putts}</b></span>
        <span>Score <b>${totals.grossStrokes}</b></span>
        <span>Stableford <b>${scoringAvailable ? totals.stablefordPoints : '—'}</b></span>
        <span>Indicative handicap <b>${indicativeHandicap}</b></span>
        <span>Within target <b>${totals.targetMet}/${totals.targetAssessed}</b></span>
      </div>
      <p class="scorecard-note">H'cap shots are allocated from the playing handicap for your target Handicap Index. Picked-up holes score zero Stableford points.</p>
    </section>`;
}

function renderRound() {
  const round = state.round;
  if (round.status === 'completed') return renderCompletedRound();
  const hole = getCurrentHole(round);
  const ball = getBallState(hole);
  const accounting = holeAccounting(hole);
  const remaining = distanceYards(ball.position, hole.greenCentre);
  const summary = roundSummary(round);
  const goal = currentShotGoal(round, hole, ball);
  const progress = targetProgress(round);
  app.innerHTML = `
    <main class="app-shell round-shell">
      <header class="round-header">
        <div><p class="eyebrow">${escapeHtml(round.course.name)} · ${round.mode}</p><h1>Hole ${hole.number}<small> of 18</small></h1>${offlineStatusMarkup()}</div>
        <div class="hole-facts"><span>${hole.par ? `Par ${hole.par}` : 'Par unavailable'}</span><span>${hole.lengthYards ? `${hole.lengthYards} yd card` : ''}</span></div>
      </header>
      ${statusMessages()}
      <section class="distance-panel">
        <span>Distance to mapped green centre</span>
        <strong>${Math.round(remaining)} <small>yd</small></strong>
        <p>${formatCoordinate(ball.position)} · route ${ball.routeClear ? 'clear' : 'recovery'}</p>
      </section>
      <section class="status-strip">
        <div><span>Recorded strokes</span><strong>${accounting.strokes}</strong></div>
        <div><span>Penalty strokes</span><strong>${accounting.penalties}</strong></div>
        <div><span>Finished holes</span><strong>${summary.completedHoles}</strong></div>
      </section>
      <section class="card action-card ${round.mode === 'gps' ? 'gps-action-card' : ''}">
        <div class="section-heading"><div><p class="step">At the ball</p><h2>Record ball position</h2></div><label class="route-control">New route <select id="route-end"><option value="true">Clear</option><option value="false">Recovery</option></select></label></div>
        ${round.mode === 'simulation' ? `
          <form id="simulation-position-form" class="simulation-position-form">
            <label>Distance from green centre <span>yards</span>
              <input name="remainingYards" type="number" min="0" max="2000" step="1" inputmode="numeric" placeholder="${goal.kind === 'distance' ? Math.round(goal.maximumEndDistanceYards) : 'Enter yards'}" required>
            </label>
            <p>Enter how far the ball finished from the green. The app calculates how far it travelled from its previous position and assesses the shot. A Recovery route can make an otherwise long-enough shot miss its target.</p>
            <div class="record-actions"><button type="submit" class="primary" name="recordType" value="stroke">Record ball position</button><button type="submit" name="recordType" value="penalty">Record penalty</button></div>
          </form>` : `<p class="gps-help">Stand beside the ball, check the new route, then press once. Wait for the GPS result.</p><div class="record-actions"><button type="button" class="primary" data-action="gps-stroke" ${state.busy ? 'disabled' : ''}>${state.busy ? 'Getting GPS fix…' : 'Record ball position'}</button><button type="button" class="penalty-button" data-action="gps-penalty" ${state.busy ? 'disabled' : ''}>${state.busy ? 'Please wait…' : 'Record penalty'}</button></div>`}
      </section>

      <section class="feedback-card">
        <div>${lastShotMarkup(hole)}</div>
        <div>${goalMarkup(goal)}</div>
        <div><strong>Target progress</strong><span>${progress.assessed ? `${progress.met} of ${progress.assessed} assessed shots (${progress.percentage}%)` : 'Pending an assessable shot.'}</span></div>
        ${roundScoreMarkup(round)}
      </section>

      <details class="card" id="finish-panel">
        <summary>Finish hole</summary>
        <form id="finish-form" class="compact-form" data-recorded-total="${accounting.eventTotal}">
          <label>Putts<input name="putts" type="number" min="0" value="0" required></label>
          <label>Total strokes <span>recorded shots + penalties + putts</span><input name="totalStrokes" type="number" min="1" value="${Math.max(1, suggestedTotalStrokes(hole, 0))}" required></label>
          <label><input name="pickedUp" type="checkbox"> Picked up — exact score unknown</label>
          <button type="submit" class="primary">Finish and advance</button>
        </form>
      </details>

      <section class="card event-card">
        <div class="section-heading"><h2>Hole events</h2><button type="button" class="text-button" data-action="undo" ${round.undoHistory.length ? '' : 'disabled'}>Undo last action</button></div>
        <ol class="event-list">${hole.events.map((event, index) => eventDescription(event, hole.events.slice(0, index + 1).filter((candidate) => candidate.type === 'stroke').length)).join('') || '<li class="empty">The first recorded endpoint will be the tee-shot landing position.</li>'}</ol>
      </section>
      <section class="utility-row">
        <button type="button" class="secondary" data-action="export">Export JSON</button>
        <button type="button" class="text-button danger" data-action="abandon">Abandon round</button>
      </section>
      ${scorecardMarkup(round)}
      <footer>${escapeHtml(state.course.quality.colourSpecificTees)}</footer>
    </main>`;
}

function renderCompletedRound() {
  const summary = roundSummary(state.round);
  const progress = targetProgress(state.round);
  app.innerHTML = `
    <main class="app-shell startup-shell">
      <header class="hero"><div><p class="eyebrow">Round saved locally</p><h1>Round complete</h1><p class="lede">All 18 holes are recorded.</p>${offlineStatusMarkup()}</div><span class="course-mark">✓</span></header>
      ${statusMessages()}
      <section class="status-strip summary-strip">
        <div><span>Holes</span><strong>${summary.completedHoles}</strong></div>
        <div><span>Gross strokes</span><strong>${summary.grossStrokes}</strong></div>
        <div><span>Penalties</span><strong>${summary.penalties}</strong></div>
      </section>
      <section class="feedback-card">
        <div><strong>Target progress</strong><span>${progress.assessed ? `${progress.met} of ${progress.assessed} assessed shots (${progress.percentage}%)` : 'No assessable shots.'}</span></div>
        ${roundScoreMarkup(state.round)}
      </section>
      <div class="utility-row"><button type="button" data-action="undo">Undo finish</button><button type="button" class="secondary" data-action="export">Export JSON</button><button type="button" class="text-button" data-action="new-profile">Back to setup</button></div>
      ${scorecardMarkup(state.round)}
    </main>`;
}

function render() {
  if (!state.course) return;
  if (state.round) renderRound();
  else renderStartup();
}

async function persistRound(nextRound, message) {
  state.round = nextRound;
  await saveRound(nextRound);
  setNotice(message);
  render();
}

function readProfileForm(form) {
  const data = new FormData(form);
  return validateProfile({
    sex: data.get('sex'),
    targetHandicap: data.get('targetHandicap'),
    driverDistance: data.get('driverDistance'),
    fairwayDistance: data.get('fairwayDistance'),
    teeColour: data.get('teeColour'),
  });
}

function getGpsPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('GPS is unavailable on this device'));
    navigator.geolocation.getCurrentPosition(
      ({ coords, timestamp }) => resolve({
        endpoint: { latitude: coords.latitude, longitude: coords.longitude },
        accuracy: coords.accuracy,
        timestamp: new Date(timestamp).toISOString(),
      }),
      (error) => {
        const messages = {
          1: 'Location permission was denied. Allow location access for GolfCaddie in Chrome settings, then try again.',
          2: 'Your phone could not determine its location. Move into the open and try again.',
          3: 'The GPS fix took too long. Move into the open and try again.',
        };
        reject(new Error(messages[error.code] || `GPS fix failed: ${error.message}`));
      },
      { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 }
    );
  });
}

async function requestPersistentStorage() {
  try {
    if (navigator.storage?.persist) await navigator.storage.persist();
  } catch {
    // IndexedDB remains usable when persistent-storage permission is unavailable.
  }
}

async function getAcceptedGpsPosition() {
  const fix = await getGpsPosition();
  if (fix.accuracy > 35 && !window.confirm(`GPS accuracy is ±${Math.round(fix.accuracy)}m. Record this fix anyway?`)) {
    return null;
  }
  return fix;
}

function downloadRound() {
  const blob = new Blob([JSON.stringify(state.round, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `golfcaddie-${state.round.id}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

app.addEventListener('change', (event) => {
  if (event.target.matches('#profile-form select[name="sex"], #profile-form select[name="teeColour"]')) {
    const form = document.querySelector('#profile-form');
    const scoring = getScoringProfile(state.course, form.elements.sex.value, form.elements.teeColour.value);
    document.querySelector('#scoring-notice').innerHTML = scoringNotice(scoring);
  }
  if (event.target.id === 'import-file' && event.target.files[0]) {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const imported = validateImportedRound(JSON.parse(reader.result), state.course.id);
        await persistRound(imported, 'Round imported and saved on this device.');
      } catch (error) {
        setNotice('', error.message);
        render();
      }
    };
    reader.readAsText(event.target.files[0]);
  }
});

app.addEventListener('input', (event) => {
  if (!event.target.matches('#finish-form input[name="putts"]')) return;
  const form = event.target.form;
  const recordedTotal = Number(form.dataset.recordedTotal);
  const putts = Number(event.target.value);
  if (Number.isInteger(recordedTotal) && Number.isInteger(putts) && putts >= 0) {
    form.elements.totalStrokes.value = Math.max(1, recordedTotal + putts);
  }
});

app.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (event.target.dataset.submitting === 'true') return;
  event.target.dataset.submitting = 'true';
  event.target.querySelectorAll('button').forEach((button) => { button.disabled = true; });
  try {
    if (event.target.id === 'profile-form') {
      const profile = readProfileForm(event.target);
      const scoringProfile = getScoringProfile(state.course, profile.sex, profile.teeColour);
      const holes = getRoundHoles(state.course, profile.teeColour, scoringProfile);
      const mode = new FormData(event.target).get('mode');
      state.profile = profile;
      await saveProfile(profile);
      await persistRound(createRound({ profile, course: state.course, scoringProfile, holes, mode }), 'New round saved.');
      requestPersistentStorage();
    }

    if (event.target.id === 'simulation-position-form') {
      const hole = getCurrentHole(state.round);
      const ball = getBallState(hole);
      const data = new FormData(event.target);
      const endpoint = simulatedEndpointFromRemainingDistance(ball.position, hole.greenCentre, Number(data.get('remainingYards')));
      const routeEnd = document.querySelector('#route-end').value === 'true';
      const penalty = event.submitter?.value === 'penalty';
      const next = penalty
        ? recordPenaltyShot(state.round, { endpoint, routeEnd, source: 'simulation' })
        : recordStroke(state.round, { endpoint, routeEnd, source: 'simulation' });
      await persistRound(next, penalty ? 'Shot and one penalty stroke recorded.' : 'Ball position recorded.');
    }

    if (event.target.id === 'finish-form') {
      const data = new FormData(event.target);
      const finishedHoleIndex = state.round.currentHoleIndex;
      const next = finishHole(state.round, {
        totalStrokes: data.get('totalStrokes'),
        putts: data.get('putts'),
        pickedUp: data.get('pickedUp') === 'on',
      });
      const result = next.holes[finishedHoleIndex].result;
      let correctionMessage = '';
      if (result?.correction > 0) correctionMessage = ` Manual correction adds ${result.correction} unassessed stroke${result.correction === 1 ? '' : 's'}.`;
      if (result?.correction < 0) correctionMessage = ` Manual correction removes ${Math.abs(result.correction)} from the event count.`;
      const advanceMessage = next.status === 'completed'
        ? 'Round complete.'
        : `Hole finished. Hole ${next.currentHoleIndex + 1} starts from its stored tee.`;
      await persistRound(next, `${advanceMessage}${correctionMessage}`);
    }

  } catch (error) {
    setNotice('', error.message);
    render();
  }
});

app.addEventListener('click', async (event) => {
  const action = event.target.closest('[data-action]')?.dataset.action;
  try {
    if (action === 'resume') {
      setNotice('Resumed from local storage.');
      renderRound();
    }
    if (action === 'install') {
      if (!state.installPrompt) {
        setNotice('On Android Chrome, open the browser menu and choose “Install app” or “Add to Home screen”.');
        return render();
      }
      const prompt = state.installPrompt;
      state.installPrompt = null;
      await prompt.prompt();
      const choice = await prompt.userChoice;
      setNotice(choice.outcome === 'accepted' ? 'GolfCaddie was added to your phone.' : 'Installation was cancelled.');
      return render();
    }
    if (action === 'gps-stroke' || action === 'gps-penalty') {
      const routeEnd = document.querySelector('#route-end')?.value !== 'false';
      state.busy = true;
      render();
      const fix = await getAcceptedGpsPosition();
      if (!fix) {
        state.busy = false;
        setNotice('GPS fix was not recorded. Retry when ready.');
        return render();
      }
      state.busy = false;
      const penalty = action === 'gps-penalty';
      const next = penalty
        ? recordPenaltyShot(state.round, { ...fix, routeEnd, source: 'gps' })
        : recordStroke(state.round, { ...fix, routeEnd, source: 'gps' });
      await persistRound(next, penalty ? 'Shot and one penalty stroke recorded.' : 'Ball position recorded.');
    }
    if (action === 'undo') await persistRound(undoLastAction(state.round), 'Last action undone.');
    if (action === 'export') downloadRound();
    if (action === 'abandon') {
      if (window.confirm('Abandon this round? Export first if you want a backup.')) {
        await clearRound();
        state.round = null;
        setNotice('Round removed from this device.');
        render();
      }
    }
    if (action === 'new-profile') {
      await clearRound();
      state.round = null;
      setNotice('Ready for a new round.');
      render();
    }
  } catch (error) {
    state.busy = false;
    setNotice('', error.message);
    render();
  }
});

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    state.offlineReady = true;
    updateOfflineStatus();
  } catch (error) {
    console.warn('Offline service worker registration failed', error);
  }
}

window.addEventListener('online', updateOfflineStatus);
window.addEventListener('offline', updateOfflineStatus);
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  state.installPrompt = event;
});
window.addEventListener('appinstalled', () => {
  state.installPrompt = null;
  setNotice('GolfCaddie is installed and can be launched from your home screen.');
  render();
});

async function init() {
  try {
    state.course = await loadCourse();
    const [profile, round] = await Promise.all([loadProfile(), loadRound()]);
    state.profile = profile ? validateProfile(profile) : null;
    state.round = round ? validateImportedRound(round, state.course.id) : null;
    if (state.profile) await saveProfile(state.profile);
    if (state.round) await saveRound(state.round);
    render();
    registerServiceWorker();
  } catch (error) {
    app.innerHTML = `<main class="app-shell"><h1>GolfCaddie could not start</h1><p>${escapeHtml(error.message)}</p><p>If you are offline, open the app once online so its course data can be cached.</p></main>`;
  }
}

init();
