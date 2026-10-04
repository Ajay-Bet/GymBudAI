// Sprint 4 independent validation of the feedback scheduler (frontend/src/feedback/scheduler.js,
// cues.js) against the "Agreed coaching contract" in docs/sprints/sprint-4-STATUS.md (GB 402/403),
// including the accepted s4-feedback additions (maxSpeechMs, enabledRuleTypes, 'stopped',
// Cue.label, speech decided once per cue, mode change cancels speech).
// Inputs are SYNTHETIC: scripted IssueOutputs and labelled synthetic FeatureFrame fixtures, with a
// fake Web Speech API. They prove scheduling logic only, not real browser speech or cue usefulness.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFeedbackScheduler } from '../src/feedback/scheduler.js';
import { FEEDBACK_CONFIG, CUE_CATALOG, TRACKING_TEXT, UNVALIDATED_LABEL, PRIORITY_POLICY, getTrackingText } from '../src/feedback/cues.js';
import { createSpeechAdapter } from '../src/feedback/speech.js';
import { createCurlIssueTracker, CURL_RULES_CONFIG } from '../src/exercises/curlRules.js';
import { createCurlAnalyzer } from '../src/exercises/curl.js';
import { buildCoachingFixtures, mulberry32, CONTRACT } from './fixtures/coaching-fixtures.js';
import { createFakeSynthesis, FakeUtterance } from './fixtures/coaching-speech-fake.js';

const SUPPRESSED = new Set([null, 'muted', 'cooldown-issue', 'cooldown-global', 'speech-unavailable', 'replaced', 'stale', 'cancelled']);
const TYPE_BY_SPEECH = Object.fromEntries(Object.entries(CUE_CATALOG).map(([type, c]) => [c.speechText, type]));

function makeSpeech(options) {
  const synth = createFakeSynthesis(options);
  return { synth, speech: createSpeechAdapter({ synthesis: synth, Utterance: FakeUtterance }) };
}
const issue = (type, episodeId, startMs, { state = 'active', enabled = false, validation = 'unvalidated' } = {}) =>
  ({ type, episodeId, startMs, peak: 15, unit: 'deg', state, enabled, validation });
const romEvent = (id, t, { enabled = false } = {}) => {
  const episode = { id, type: 'incomplete-rom', startMs: t, endMs: t, peak: 50, unit: 'deg', endReason: 'evaluated-at-attempt-end', attemptIds: ['a'],
    rulesVersion: 'curl-rules-1.0.0', analyzerVersion: 'curl-1.1.0', enabled, validation: 'unvalidated' };
  return [{ type: 'issue-started', episode }, { type: 'issue-ended', episode }];
};

/**
 * Drive a scheduler with a scripted SYNTHETIC timeline.
 * episodes: [{ type, id, startMs, endMs, enabled? }] (incomplete-rom: an instant event at startMs).
 * unassessable: [[fromMs, toMs, reason]]. speechMs: how long each utterance lasts (Infinity = never ends).
 */
function simulate({ fps = 30, seed = 1, durationMs = 20000, episodes = [], unassessable = [], mode = 'review', speechMs = 1200,
  jitter = 0.2, enabledRuleTypes, speechOptions, actions = {} }) {
  const { synth, speech } = makeSpeech(speechOptions);
  const sched = createFeedbackScheduler({ speech, mode, ...(enabledRuleTypes ? { enabledRuleTypes } : {}) });
  speech.prime();
  const rng = mulberry32(seed);
  const states = [], spoken = [];
  const firedRom = new Set();
  let speakCount = 0, speakingSince = null;
  const pendingActions = Object.entries(actions).map(([at, fn]) => ({ at: Number(at), fn }));
  for (let t = 0; t < durationMs; t += (1000 / fps) * (1 + (rng() * 2 - 1) * jitter)) {
    for (const a of pendingActions) if (!a.done && t >= a.at) { a.done = true; a.fn({ sched, speech, synth, t }); }
    if (speakingSince !== null && t - speakingSince >= speechMs && synth.outstanding > 0) { synth.finish(); speakingSince = null; }
    const gap = unassessable.find(([from, to]) => t >= from && t < to);
    const active = episodes.filter((e) => e.type !== 'incomplete-rom' && t >= e.startMs && t < e.endMs)
      .map((e) => issue(e.type, e.id, e.startMs, { state: gap ? 'suspended' : 'active', enabled: e.enabled ?? false }));
    const events = [];
    if (!gap) for (const e of episodes) if (e.type === 'incomplete-rom' && t >= e.startMs && !firedRom.has(e.id)) { firedRom.add(e.id); events.push(...romEvent(e.id, t, e)); }
    const state = sched.update({ timestampMs: t, issueOutput: { timestampMs: t, assessable: !gap, unavailableReason: gap ? gap[2] : null, active, events } });
    const real = synth.spoken();
    if (real.length > speakCount) {
      for (const s of real.slice(speakCount)) spoken.push({ type: TYPE_BY_SPEECH[s.text], atMs: t });
      speakCount = real.length; speakingSince = t;
    }
    if (synth.outstanding === 0) speakingSince = null;
    states.push({ t, state });
  }
  const log = sched.getCueLog();
  for (const entry of log) assert.ok(SUPPRESSED.has(entry.suppressed), `unknown suppression ${entry.suppressed}`);
  return { sched, synth, speech, states, spoken, log };
}

test('config: feedback-1.1.0 frozen with the contract numbers, explicit (non-severity) priority policy and texts', () => {
  assert.equal(FEEDBACK_CONFIG.version, CONTRACT.feedbackVersion);
  assert.ok(Object.isFrozen(FEEDBACK_CONFIG));
  for (const [key, value] of Object.entries(CONTRACT.feedback)) assert.deepEqual(FEEDBACK_CONFIG[key], value, key);
  assert.equal(FEEDBACK_CONFIG.maxSpeechMs, 8000);
  assert.equal(PRIORITY_POLICY.basis, 'explicit-policy-not-severity');
  for (const type of Object.keys(CONTRACT.rules)) {
    assert.equal(CUE_CATALOG[type].text, CONTRACT.cueTexts[type]);
    assert.ok(CUE_CATALOG[type].speechText.length > 0);
  }
  for (const reason of ['tracking-dropout', 'tracking-loss', 'calibration-required', 'unsupported-view', 'recalibration', 'no-validated-rules']) {
    assert.ok(TRACKING_TEXT[reason], `text for ${reason}`);
  }
  assert.equal(TRACKING_TEXT['no-validated-rules'], 'Form coaching off: no rule has been validated yet');
  assert.equal(UNVALIDATED_LABEL, 'unvalidated rule');
  for (const text of [...Object.values(TRACKING_TEXT), ...Object.values(CUE_CATALOG).flatMap((c) => [c.text, c.speechText])]) {
    assert.doesNotMatch(text, /injur|clinical|safe|prevent/i, 'no injury or clinical claims');
  }
  assert.throws(() => createFeedbackScheduler({ mode: 'coach-all' }));
  assert.throws(() => createFeedbackScheduler({ config: { globalCooldownMs: -1 } }));
});

test('synthetic e2e: two simultaneous issues -> only the torso cue (priority) is spoken; both episodes remain in the tracker session', (t) => {
  const rows = [];
  for (const fps of [15, 30, 60]) for (const seed of [1, 2, 3, 4, 5]) {
    const fx = buildCoachingFixtures({ fps, seed }).find((f) => f.name === 'overlap-both');
    const { synth, speech } = makeSpeech();
    const analyzer = createCurlAnalyzer(), tracker = createCurlIssueTracker();
    const sched = createFeedbackScheduler({ speech, mode: 'review' });
    const primaries = new Set();
    for (const f of fx.frames) {
      const state = sched.update({ timestampMs: f.timestampMs, issueOutput: tracker.update(f, analyzer.update(f)) });
      if (state.primaryCue) primaries.add(state.primaryCue.issueType);
    }
    const spoken = synth.spoken().map((s) => TYPE_BY_SPEECH[s.text]);
    assert.deepEqual(spoken, ['torso-swing'], `fps ${fps} seed ${seed}`);
    assert.deepEqual([...primaries], ['torso-swing']);
    const eps = tracker.getSession().episodes.map((e) => e.type).sort();
    assert.deepEqual(eps, ['torso-swing', 'upper-arm-drift']);
    rows.push(`${fps}fps/s${seed}`);
  }
  t.diagnostic(`SYNTHETIC overlap-both: 1 spoken cue (torso) in ${rows.length}/15 runs`);
});

test('synthetic: a higher-priority cue replaces a queued cue while a long utterance plays', () => {
  const r = simulate({ durationMs: 9000, speechMs: 6000, episodes: [
    { type: 'incomplete-rom', id: 'rom-1', startMs: 1000 },
    { type: 'upper-arm-drift', id: 'drift-1', startMs: 5100, endMs: 9000 },
    { type: 'torso-swing', id: 'torso-1', startMs: 5300, endMs: 9000 }] });
  assert.deepEqual(r.spoken.map((s) => s.type), ['incomplete-rom', 'torso-swing']);
  assert.ok(r.spoken[1].atMs >= 7000 && r.spoken[1].atMs < 7100, 'torso spoken when the long utterance ended');
  const drift = r.log.find((e) => e.issueType === 'upper-arm-drift');
  assert.equal(drift.suppressed, 'replaced');
  assert.equal(drift.spokenMs, null);
  assert.ok(r.synth.maxOutstanding <= 1);
});

test('synthetic: a queued cue older than maxQueueAgeMs is dropped as stale and never spoken late', () => {
  const r = simulate({ durationMs: 12000, speechMs: 7000, episodes: [
    { type: 'incomplete-rom', id: 'rom-1', startMs: 1000 },
    { type: 'upper-arm-drift', id: 'drift-1', startMs: 5100, endMs: 12000 }] });
  assert.deepEqual(r.spoken.map((s) => s.type), ['incomplete-rom']);
  const drift = r.log.find((e) => e.issueType === 'upper-arm-drift');
  assert.equal(drift.suppressed, 'stale');
  assert.equal(drift.spokenMs, null);
});

test('synthetic: a queued cue whose episode ended is dropped as stale', () => {
  const r = simulate({ durationMs: 9000, speechMs: 5000, episodes: [
    { type: 'incomplete-rom', id: 'rom-1', startMs: 1000 },
    { type: 'upper-arm-drift', id: 'drift-1', startMs: 5100, endMs: 5700 }] });
  assert.deepEqual(r.spoken.map((s) => s.type), ['incomplete-rom']);
  assert.equal(r.log.find((e) => e.issueType === 'upper-arm-drift').suppressed, 'stale');
});

test('synthetic: per-issue and global cooldowns give the same spoken sequence at 15/30/60 fps across seeds', (t) => {
  const episodes = [
    { type: 'torso-swing', id: 't1', startMs: 2000, endMs: 3000 },
    { type: 'torso-swing', id: 't2', startMs: 4000, endMs: 5000 }, // per-issue (and global) cooldown
    { type: 'upper-arm-drift', id: 'd1', startMs: 6500, endMs: 7500 }, // global passed at 6000 -> spoken
    { type: 'torso-swing', id: 't3', startMs: 8000, endMs: 9000 }, // per-issue cooldown until 12000
    { type: 'upper-arm-drift', id: 'd2', startMs: 11000, endMs: 11500 }, // per-issue cooldown until 16500
    { type: 'torso-swing', id: 't4', startMs: 13000, endMs: 14000 }, // spoken
    { type: 'incomplete-rom', id: 'r1', startMs: 14600 }, // global cooldown until 17000
    { type: 'torso-swing', id: 't5', startMs: 16000, endMs: 17000 }, // per-issue until 23000
  ];
  const expectedSpoken = [['torso-swing', 2000], ['upper-arm-drift', 6500], ['torso-swing', 13000]];
  const expectedSuppressed = { t2: ['cooldown-issue'], t3: ['cooldown-issue'], d2: ['cooldown-issue'], r1: ['cooldown-global'], t5: ['cooldown-issue'] };
  let runs = 0, mismatches = 0, maxDelay = 0;
  for (const fps of [15, 30, 60]) for (let seed = 1; seed <= 20; seed++) {
    const r = simulate({ fps, seed, durationMs: 18000, episodes });
    runs += 1;
    const ok = r.spoken.length === expectedSpoken.length && r.spoken.every((s, i) => s.type === expectedSpoken[i][0]
      && s.atMs >= expectedSpoken[i][1] && s.atMs - expectedSpoken[i][1] <= 1000 / fps * 1.25);
    if (!ok) mismatches += 1;
    for (const [i, s] of r.spoken.entries()) maxDelay = Math.max(maxDelay, s.atMs - expectedSpoken[i]?.[1]);
    assert.ok(ok, `fps ${fps} seed ${seed}: spoken ${JSON.stringify(r.spoken)}`);
    for (const [id, reasons] of Object.entries(expectedSuppressed)) {
      const entry = r.log.find((e) => e.episodeId === id);
      assert.ok(entry, `fps ${fps} seed ${seed}: no cue for ${id}`);
      assert.ok(reasons.includes(entry.suppressed), `fps ${fps} seed ${seed}: ${id} suppressed ${entry.suppressed}`);
    }
  }
  t.diagnostic(`SYNTHETIC cooldown timeline: ${runs - mismatches}/${runs} runs match the expected spoken sequence; max speak delay after episode start ${maxDelay.toFixed(0)} ms`);
});

test('synthetic: one primary cue at a time, held at least minCueDisplayMs; an incomplete-rom cue shows for attemptEndCueDisplayMs', () => {
  const r = simulate({ durationMs: 9000, episodes: [
    { type: 'upper-arm-drift', id: 'd1', startMs: 1000, endMs: 1300 },
    { type: 'incomplete-rom', id: 'r1', startMs: 4000 }] });
  const shown = (id) => r.states.filter((s) => s.state.primaryCue?.episodeId === id).map((s) => s.t);
  const d = shown('d1');
  assert.ok(d.at(-1) - d[0] >= FEEDBACK_CONFIG.minCueDisplayMs - 40, `drift shown ${d.at(-1) - d[0]} ms`);
  assert.ok(d.at(-1) - d[0] <= FEEDBACK_CONFIG.minCueDisplayMs + 40);
  const rom = shown('r1');
  assert.ok(rom.at(-1) - rom[0] >= FEEDBACK_CONFIG.attemptEndCueDisplayMs - 40 && rom.at(-1) - rom[0] <= FEEDBACK_CONFIG.attemptEndCueDisplayMs + 40);
  for (const s of r.states) {
    if (s.state.primaryCue) assert.equal(s.state.status, 'coaching');
  }
});

test('synthetic: long speech never builds a backlog; an utterance with no end event is cancelled after maxSpeechMs', () => {
  const r = simulate({ durationMs: 12000, speechMs: Infinity, episodes: [{ type: 'torso-swing', id: 't1', startMs: 1000, endMs: 12000 }] });
  assert.equal(r.spoken.length, 1);
  assert.ok(r.synth.maxOutstanding <= 1);
  assert.equal(r.synth.outstanding, 0, 'watchdog cancelled the stuck utterance');
  const firstCancelled = r.states.find((s) => s.state.cancelledSpeech);
  assert.ok(firstCancelled && firstCancelled.t - 1000 > FEEDBACK_CONFIG.maxSpeechMs && firstCancelled.t - 1000 < FEEDBACK_CONFIG.maxSpeechMs + 100);
  assert.equal(r.log[0].suppressed, 'cancelled');
});

test('synthetic: mute cancels current speech; muted cues stay visible as text and are logged muted; unmute speaks later cues', () => {
  const r = simulate({ durationMs: 20000, speechMs: 3000, episodes: [
    { type: 'torso-swing', id: 't1', startMs: 1000, endMs: 3000 },
    { type: 'upper-arm-drift', id: 'd1', startMs: 6000, endMs: 7000 },
    { type: 'torso-swing', id: 't2', startMs: 12000, endMs: 13000 }],
  actions: { 1500: ({ sched }) => sched.setMuted(true), 9000: ({ sched }) => sched.setMuted(false) } });
  assert.deepEqual(r.spoken.map((s) => s.type), ['torso-swing', 'torso-swing']);
  const at = (ms) => r.states.find((s) => s.t >= ms);
  assert.equal(r.synth.log.filter((e) => e.type === 'cancel' && e.count > 0).length >= 1, true);
  assert.equal(at(1600).state.spokenCueId, null, 'speech cancelled by mute');
  assert.equal(at(6100).state.primaryCue?.issueType, 'upper-arm-drift', 'text cue unaffected by mute');
  assert.equal(r.log.find((e) => e.episodeId === 'd1').suppressed, 'muted');
  assert.equal(r.log.find((e) => e.episodeId === 't1').suppressed, 'cancelled');
});

test('synthetic: tracking loss / dropout / unsupported view cancel speech and withhold the cue; tracking text is separate', () => {
  for (const reason of ['tracking-loss', 'tracking-dropout', 'unsupported-view', 'calibration-required']) {
    const r = simulate({ durationMs: 4000, speechMs: 3000, episodes: [{ type: 'torso-swing', id: 't1', startMs: 1000, endMs: 4000 }],
      unassessable: [[1500, 2000, reason]] });
    const during = r.states.filter((s) => s.t >= 1500 && s.t < 2000);
    assert.ok(during[0].state.cancelledSpeech, `${reason}: speech not cancelled`);
    for (const { state } of during) {
      assert.equal(state.status, 'unavailable');
      assert.equal(state.primaryCue, null, `${reason}: form cue shown while unassessable`);
      assert.equal(state.spokenCueId, null);
      assert.equal(state.tracking.assessable, false);
      assert.equal(state.tracking.reason, reason);
      assert.equal(state.tracking.text, getTrackingText(reason));
    }
    assert.equal(r.synth.outstanding, 0);
    // The cue comes back as text after recovery but is not re-spoken inside the cooldown.
    assert.ok(r.states.some((s) => s.t > 2000 && s.state.primaryCue?.issueType === 'torso-swing'));
    assert.equal(r.spoken.length, 1);
  }
});

test('stop and reset cancel speech; stop reports off/stopped and ignores updates until reset', () => {
  const r = simulate({ durationMs: 2000, speechMs: Infinity, episodes: [{ type: 'torso-swing', id: 't1', startMs: 500, endMs: 2000 }] });
  assert.equal(r.synth.outstanding, 1);
  r.sched.stop();
  assert.equal(r.synth.outstanding, 0);
  let s = r.sched.getState();
  assert.equal(s.status, 'off');
  assert.equal(s.tracking.reason, 'stopped');
  assert.equal(s.primaryCue, null);
  s = r.sched.update({ timestampMs: 2100, issueOutput: { timestampMs: 2100, assessable: true, unavailableReason: null, active: [issue('upper-arm-drift', 'd9', 2100)], events: [] } });
  assert.equal(s.status, 'off');
  assert.equal(r.synth.spoken().length, 1);
  r.sched.reset();
  assert.deepEqual(r.sched.getCueLog(), []);
  s = r.sched.update({ timestampMs: 2200, issueOutput: { timestampMs: 2200, assessable: true, unavailableReason: null, active: [issue('upper-arm-drift', 'd9', 2200)], events: [] } });
  assert.equal(s.primaryCue?.issueType, 'upper-arm-drift');
  assert.equal(r.synth.spoken().length, 2, 'reset clears cooldowns');
  // reset while speaking cancels.
  r.sched.reset();
  assert.equal(r.synth.outstanding, 0);
});

test('mode change cancels speech and clears the cue', () => {
  const r = simulate({ durationMs: 2000, speechMs: Infinity, episodes: [{ type: 'torso-swing', id: 't1', startMs: 500, endMs: 2000 }] });
  assert.equal(r.synth.outstanding, 1);
  r.sched.setMode('validated-only');
  assert.equal(r.synth.outstanding, 0);
  const s = r.sched.update({ timestampMs: 2100, issueOutput: { timestampMs: 2100, assessable: true, unavailableReason: null, active: [issue('torso-swing', 't1', 500)], events: [] } });
  assert.equal(s.primaryCue, null, 'unvalidated rule must not cue in validated-only mode');
});

test('synthetic e2e: default validated-only mode gives no form cue and no speech while all rules are disabled', () => {
  for (const fps of [15, 30, 60]) for (const fx of buildCoachingFixtures({ fps, seed: 2 })) {
    const { synth, speech } = makeSpeech();
    const analyzer = createCurlAnalyzer(), tracker = createCurlIssueTracker();
    const sched = createFeedbackScheduler({ speech, enabledRuleTypes: [] });
    assert.equal(sched.mode, 'validated-only');
    for (const f of fx.frames) {
      const out = tracker.update(f, analyzer.update(f));
      const state = sched.update({ timestampMs: f.timestampMs, issueOutput: out });
      assert.equal(state.primaryCue, null, `${fx.name}: form cue in validated-only mode`);
      if (out.assessable) { assert.equal(state.status, 'off'); assert.equal(state.tracking.reason, 'no-validated-rules'); }
      else assert.equal(state.status, 'unavailable');
    }
    assert.equal(synth.spoken().length, 0);
    assert.deepEqual(sched.getCueLog(), []);
  }
});

test('synthetic e2e: validated-only cues only an enabled rule (config override), never a disabled one', () => {
  const fx = buildCoachingFixtures({ fps: 30, seed: 3 }).find((f) => f.name === 'overlap-both');
  const { synth, speech } = makeSpeech();
  const analyzer = createCurlAnalyzer();
  const tracker = createCurlIssueTracker({ config: { rules: { 'upper-arm-drift': { enabled: true } } } });
  const sched = createFeedbackScheduler({ speech, enabledRuleTypes: ['upper-arm-drift'] });
  const types = new Set();
  for (const f of fx.frames) {
    const s = sched.update({ timestampMs: f.timestampMs, issueOutput: tracker.update(f, analyzer.update(f)) });
    if (s.primaryCue) types.add(s.primaryCue.issueType);
  }
  assert.deepEqual([...types], ['upper-arm-drift']);
  assert.deepEqual(synth.spoken().map((s) => TYPE_BY_SPEECH[s.text]), ['upper-arm-drift']);
  assert.equal(CURL_RULES_CONFIG.rules['upper-arm-drift'].enabled, false);
});

test('synthetic: review mode labels every cue unvalidated and logs the mode', () => {
  const r = simulate({ durationMs: 8000, episodes: [{ type: 'torso-swing', id: 't1', startMs: 1000, endMs: 2000 }, { type: 'incomplete-rom', id: 'r1', startMs: 6000 }] });
  const cues = r.states.map((s) => s.state.primaryCue).filter(Boolean);
  assert.ok(cues.length > 0);
  for (const c of cues) { assert.equal(c.validation, 'unvalidated'); assert.equal(c.label, UNVALIDATED_LABEL); assert.match(c.id, /^cue-.+-\d+$/); }
  assert.ok(r.log.length === 2 && r.log.every((e) => e.mode === 'review' && e.validation === 'unvalidated'));
  assert.equal(new Set(r.log.map((e) => e.cueId)).size, r.log.length);
});

test('speech unavailable (no adapter, or adapter without speechSynthesis): text cues work, log says speech-unavailable', () => {
  for (const speech of [null, createSpeechAdapter({ synthesis: null, Utterance: null })]) {
    const sched = createFeedbackScheduler({ speech, mode: 'review' });
    let s;
    for (let t = 0; t < 2000; t += 33) {
      s = sched.update({ timestampMs: t, issueOutput: { timestampMs: t, assessable: true, unavailableReason: null, active: t >= 500 ? [issue('torso-swing', 't1', 500)] : [], events: [] } });
    }
    assert.equal(s.primaryCue?.text, CONTRACT.cueTexts['torso-swing']);
    assert.equal(sched.getCueLog()[0].suppressed, 'speech-unavailable');
    assert.doesNotThrow(() => { sched.setMuted(true); sched.stop(); sched.reset(); });
  }
});

test('synthetic: a browser speech error is logged speech-unavailable, not as spoken', () => {
  const { synth, speech } = makeSpeech();
  const sched = createFeedbackScheduler({ speech, mode: 'review' });
  sched.update({ timestampMs: 0, issueOutput: { timestampMs: 0, assessable: true, unavailableReason: null, active: [issue('torso-swing', 't1', 0)], events: [] } });
  const u = synth.log.find((e) => e.type === 'speak').utterance;
  u.onerror({ error: 'not-allowed' });
  const entry = sched.getCueLog()[0];
  assert.equal(entry.suppressed, 'speech-unavailable');
  assert.equal(entry.spokenMs, null);
});

test('scheduler rejects backwards / non-finite timestamps without changing state', () => {
  const { speech } = makeSpeech();
  const sched = createFeedbackScheduler({ speech, mode: 'review' });
  const a = sched.update({ timestampMs: 1000, issueOutput: { timestampMs: 1000, assessable: true, unavailableReason: null, active: [issue('torso-swing', 't1', 1000)], events: [] } });
  const b = sched.update({ timestampMs: 900, issueOutput: { timestampMs: 900, assessable: false, unavailableReason: 'tracking-loss', active: [], events: [] } });
  assert.equal(b, a);
  const c = sched.update({ timestampMs: Number.NaN, issueOutput: null });
  assert.equal(c, a);
});

const out = (t, active, { assessable = true, reason = null, events = [] } = {}) =>
  ({ timestamp: t, issueOutput: { timestampMs: t, assessable, unavailableReason: assessable ? null : reason, active, events } });
const feed = (sched, t, active, opts) => { const o = out(t, active, opts); return sched.update({ timestampMs: o.timestamp, issueOutput: o.issueOutput }); };

test('synthetic (D3): after a dropout and recovery the episode keeps one cue id and log entry (reshownCount 1) and is not spoken again', () => {
  const { synth, speech } = makeSpeech();
  const sched = createFeedbackScheduler({ speech, mode: 'review' });
  const first = feed(sched, 1000, [issue('torso-swing', 't1', 1000)]);
  assert.equal(synth.spoken().length, 1);
  synth.finish();
  feed(sched, 1500, [issue('torso-swing', 't1', 1000, { state: 'suspended' })], { assessable: false, reason: 'tracking-dropout' });
  const back = feed(sched, 1600, [issue('torso-swing', 't1', 1000)]);
  assert.equal(back.primaryCue.id, first.primaryCue.id);
  assert.equal(back.primaryCue.sinceMs, 1600);
  const log = sched.getCueLog();
  assert.equal(log.length, 1);
  assert.equal(log[0].reshownCount, 1);
  assert.equal(log[0].spokenMs, 1000);
  assert.equal(synth.spoken().length, 1, 'a reshown cue must not be spoken again');
  // A second dropout, after the cooldowns would have expired, still does not re-speak the same episode.
  feed(sched, 16000, [issue('torso-swing', 't1', 1000, { state: 'suspended' })], { assessable: false, reason: 'tracking-dropout' });
  feed(sched, 16100, [issue('torso-swing', 't1', 1000)]);
  assert.equal(sched.getCueLog()[0].reshownCount, 2);
  assert.equal(synth.spoken().length, 1);
  // A new episode of the same type gets a new cue id and log entry.
  feed(sched, 16200, []);
  const next = feed(sched, 18000, [issue('torso-swing', 't2', 18000)]); // after t1's minCueDisplayMs hold
  assert.notEqual(next.primaryCue.id, first.primaryCue.id);
  assert.equal(sched.getCueLog().length, 2);
  assert.equal(sched.getCueLog()[1].reshownCount, 0);
});

test('synthetic (D3): chattering dropouts across a 5 s episode give one cue log entry, so false-cue counts are per episode', () => {
  const { synth, speech } = makeSpeech();
  const sched = createFeedbackScheduler({ speech, mode: 'review' });
  for (let t = 0; t < 5000; t += 33) {
    const drop = t % 300 < 33;
    feed(sched, t, [issue('torso-swing', 't1', 0, { state: drop ? 'suspended' : 'active' })], { assessable: !drop, reason: 'tracking-dropout' });
  }
  const log = sched.getCueLog();
  assert.equal(log.length, 1);
  assert.ok(log[0].reshownCount >= 10);
  assert.equal(synth.spoken().length, 1);
});

test('synthetic (D4): a speech error rolls back both cooldowns; a cancellation does not; no rollback when a newer cue spoke', () => {
  // Error: next issue of the same type (and any type) may speak at once.
  {
    const { synth, speech } = makeSpeech();
    const sched = createFeedbackScheduler({ speech, mode: 'review' });
    feed(sched, 1000, [issue('torso-swing', 't1', 1000)]);
    synth.log.filter((e) => e.type === 'speak').at(-1).utterance.onerror({ error: 'not-allowed' });
    const entry = sched.getCueLog()[0];
    assert.equal(entry.spokenMs, null);
    assert.equal(entry.suppressed, 'speech-unavailable');
    feed(sched, 1200, []);
    feed(sched, 3000, [issue('upper-arm-drift', 'd1', 3000)]); // inside the old global cooldown
    assert.equal(sched.getCueLog()[1].suppressed, null, 'global cooldown not rolled back');
    synth.finish();
    feed(sched, 3600, []);
    feed(sched, 8000, [issue('torso-swing', 't2', 8000)]); // inside the old torso per-issue cooldown, global passed
    assert.equal(sched.getCueLog()[2].suppressed, null, 'per-issue cooldown not rolled back');
    assert.equal(synth.spoken().length, 3);
  }
  // Cancellation (e.g. mute): cooldowns stay.
  {
    const { synth, speech } = makeSpeech();
    const sched = createFeedbackScheduler({ speech, mode: 'review' });
    feed(sched, 1000, [issue('torso-swing', 't1', 1000)]);
    sched.setMuted(true); sched.setMuted(false);
    assert.equal(sched.getCueLog()[0].suppressed, 'cancelled');
    assert.equal(sched.getCueLog()[0].spokenMs, 1000);
    feed(sched, 1200, []);
    feed(sched, 3000, [issue('upper-arm-drift', 'd1', 3000)]);
    assert.equal(sched.getCueLog()[1].suppressed, 'cooldown-global');
    assert.equal(synth.spoken().length, 1);
  }
  // A late error from an older utterance after a newer cue started: the newer cue's cooldowns stay.
  {
    const { synth, speech } = makeSpeech({ cancelEvent: 'none' });
    const sched = createFeedbackScheduler({ speech, mode: 'review' });
    feed(sched, 1000, [issue('torso-swing', 't1', 1000)]);
    const old = synth.log.filter((e) => e.type === 'speak').at(-1).utterance;
    synth.finish();
    feed(sched, 1100, []);
    feed(sched, 6000, [issue('upper-arm-drift', 'd1', 6000)]);
    assert.equal(synth.spoken().length, 2);
    old.onerror({ error: 'network' }); // stale event for the first cue, ignored by the adapter
    const newer = synth.log.filter((e) => e.type === 'speak').at(-1).utterance;
    newer.onerror({ error: 'synthesis-failed' }); // newer cue fails: its own rollback restores torso's times
    feed(sched, 6100, []);
    feed(sched, 8000, [issue('torso-swing', 't2', 8000)]); // after drift's minCueDisplayMs hold
    assert.equal(sched.getCueLog().at(-1).suppressed, 'cooldown-issue', 'torso per-issue cooldown from 1000 must remain');
  }
});

test('setMuted(true) while a cue is queued logs the queued cue as muted and never speaks it', () => {
  const r = simulate({ durationMs: 7000, speechMs: Infinity, episodes: [
    { type: 'incomplete-rom', id: 'rom-1', startMs: 1000 },
    { type: 'upper-arm-drift', id: 'drift-1', startMs: 5100, endMs: 7000 }],
  actions: { 5300: ({ sched }) => sched.setMuted(true) } });
  const drift = r.log.find((e) => e.episodeId === 'drift-1');
  assert.equal(drift.suppressed, 'muted');
  assert.equal(drift.spokenMs, null);
  assert.deepEqual(r.spoken.map((s) => s.type), ['incomplete-rom']);
  assert.equal(r.synth.outstanding, 0);
});

test('text output is identical with speech absent and with speech muted (text never depends on speech)', () => {
  const episodes = [
    { type: 'torso-swing', id: 't1', startMs: 1000, endMs: 3000 },
    { type: 'upper-arm-drift', id: 'd1', startMs: 2000, endMs: 6000 },
    { type: 'incomplete-rom', id: 'r1', startMs: 7000 },
    { type: 'torso-swing', id: 't2', startMs: 9000, endMs: 12000 }];
  const project = (states) => states.map(({ t, state }) => [t, state.status, state.primaryCue?.id.replace(/^cue-[^]*-(\d+)$/, '$1') ?? null,
    state.primaryCue?.text ?? null, state.tracking.reason, state.tracking.text]);
  const muted = simulate({ durationMs: 14000, episodes, unassessable: [[4000, 4300, 'tracking-dropout']], actions: { 0: ({ sched }) => sched.setMuted(true) } });
  const absent = simulate({ durationMs: 14000, episodes, unassessable: [[4000, 4300, 'tracking-dropout']], speechOptions: undefined,
    actions: { 0: ({ sched }) => sched.setMuted(false) } });
  // Rebuild "absent" with no adapter at all, same scripted timeline.
  const sched = createFeedbackScheduler({ speech: null, mode: 'review' });
  const states = [];
  const firedRom = new Set();
  for (const { t } of muted.states) {
    const gap = t >= 4000 && t < 4300;
    const active = episodes.filter((e) => e.type !== 'incomplete-rom' && t >= e.startMs && t < e.endMs)
      .map((e) => issue(e.type, e.id, e.startMs, { state: gap ? 'suspended' : 'active' }));
    const events = [];
    if (!gap) for (const e of episodes) if (e.type === 'incomplete-rom' && t >= e.startMs && !firedRom.has(e.id)) { firedRom.add(e.id); events.push(...romEvent(e.id, t)); }
    states.push({ t, state: sched.update({ timestampMs: t, issueOutput: { timestampMs: t, assessable: !gap, unavailableReason: gap ? 'tracking-dropout' : null, active, events } }) });
  }
  assert.deepEqual(project(states), project(muted.states));
  assert.equal(muted.spoken.length, 0);
  assert.ok(absent.spoken.length > 0, 'control run with speech on does speak');
  assert.ok(sched.getCueLog().every((e) => e.suppressed === 'speech-unavailable'));
  assert.ok(muted.log.every((e) => e.suppressed === 'muted'));
});

test("(D6) tracking texts: 'stopped' is 'Session stopped'; 'low-frame-rate' is defined; scheduler passes low-frame-rate through", () => {
  assert.equal(getTrackingText('stopped'), 'Session stopped');
  assert.ok(TRACKING_TEXT['low-frame-rate'] && TRACKING_TEXT['low-frame-rate'] !== TRACKING_TEXT['tracking-loss']);
  const { speech } = makeSpeech();
  const sched = createFeedbackScheduler({ speech, mode: 'review' });
  feed(sched, 0, [issue('torso-swing', 't1', 0)]);
  const s = feed(sched, 100, [issue('torso-swing', 't1', 0, { state: 'suspended' })], { assessable: false, reason: 'low-frame-rate' });
  assert.equal(s.status, 'unavailable');
  assert.equal(s.primaryCue, null);
  assert.equal(s.tracking.text, TRACKING_TEXT['low-frame-rate']);
  sched.stop();
  assert.equal(sched.getState().tracking.text, 'Session stopped');
});
