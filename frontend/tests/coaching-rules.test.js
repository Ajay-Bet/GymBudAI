// Sprint 4 independent validation of the curl issue tracker (frontend/src/exercises/curlRules.js)
// against the "Agreed coaching contract" in docs/sprints/sprint-4-STATUS.md (GB 401).
// All inputs are labelled SYNTHETIC FeatureFrames (tests/fixtures/coaching-fixtures.js and
// curl-fixtures.js). Passing results prove timing logic and arithmetic only; they are not reviewed
// recordings and say nothing about detection accuracy on real movement.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CURL_RULES_CONFIG, createCurlIssueTracker } from '../src/exercises/curlRules.js';
import { CURL_CONFIG, createCurlAnalyzer } from '../src/exercises/curl.js';
import { buildCoachingFixtures, stream, steps, randomSpikes, curlsWithIssues, render, curl, CONTRACT } from './fixtures/coaching-fixtures.js';

const TYPES = ['torso-swing', 'upper-arm-drift', 'incomplete-rom'];
const REASONS = new Set(['tracking-dropout', 'tracking-loss', 'calibration-required', 'unsupported-view', 'recalibration', 'low-frame-rate']);
const END_REASONS = new Set(['resolved', 'tracking-lost', 'recalibration', 'set-ended', 'reset', 'evaluated-at-attempt-end']);
const EPISODE_FIELDS = ['id', 'type', 'startMs', 'endMs', 'peak', 'unit', 'endReason', 'attemptIds', 'rulesVersion', 'analyzerVersion', 'enabled', 'validation'];
const FPS = [15, 30, 60];
const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);

/** Feed frames through analyzer -> tracker, checking per-frame invariants. */
function run(frames, { tracker = createCurlIssueTracker(), analyzer = createCurlAnalyzer() } = {}) {
  const outputs = [], events = [], analyzerEvents = [];
  const started = new Map(), ended = new Map();
  let lastProcessed = -Infinity;
  for (const frame of frames) {
    const a = analyzer.update(frame);
    const out = tracker.update(frame, a);
    analyzerEvents.push(...a.events);
    for (const key of ['timestampMs', 'assessable', 'unavailableReason', 'active', 'events']) assert.ok(key in out, `IssueOutput.${key} missing`);
    const stale = frame.timestampMs <= lastProcessed;
    if (stale) assert.equal(out.events.length, 0, `stale timestamp ${frame.timestampMs} produced issue events`);
    else lastProcessed = frame.timestampMs;
    if (out.assessable) assert.equal(out.unavailableReason, null);
    else if (!stale) assert.ok(REASONS.has(out.unavailableReason), `bad unavailableReason ${out.unavailableReason}`);
    for (const issue of out.active) {
      assert.ok(TYPES.includes(issue.type));
      assert.equal(issue.unit, 'deg');
      assert.ok(issue.state === 'active' || issue.state === 'suspended');
      if (!out.assessable && !stale) assert.equal(issue.state, 'suspended', `active issue not suspended on a non-assessable frame ${frame.timestampMs}`);
      assert.equal(issue.enabled, false, 'default rules must be disabled');
      assert.equal(issue.validation, 'unvalidated');
    }
    for (const e of out.events) {
      const ep = e.episode;
      for (const key of EPISODE_FIELDS) assert.ok(key in ep, `episode.${key} missing`);
      assert.equal(ep.rulesVersion, CONTRACT.rulesVersion);
      assert.equal(ep.analyzerVersion, CURL_CONFIG.version);
      if (e.type === 'issue-started') {
        assert.ok(!started.has(ep.id), `episode ${ep.id} started twice`);
        assert.ok(out.assessable, 'an episode started on a non-assessable frame');
        started.set(ep.id, { ...ep, atMs: frame.timestampMs });
      } else {
        assert.equal(e.type, 'issue-ended');
        assert.ok(started.has(ep.id), `episode ${ep.id} ended before it started`);
        assert.ok(!ended.has(ep.id), `episode ${ep.id} ended twice`);
        assert.ok(END_REASONS.has(ep.endReason), `bad endReason ${ep.endReason}`);
        if (ep.endReason === 'resolved') assert.ok(out.assessable, 'an episode was resolved on a non-assessable frame');
        assert.ok(ep.endMs >= ep.startMs, 'episode ends before it starts');
        assert.ok(ep.endMs <= frame.timestampMs, 'episode endMs after the frame that ended it');
        ended.set(ep.id, { ...ep, atMs: frame.timestampMs });
      }
      events.push({ ...e, atMs: frame.timestampMs });
    }
    outputs.push({ frame, a, out });
  }
  const session = tracker.getSession();
  const ids = session.episodes.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate episode ids in session');
  return { tracker, analyzer, outputs, events, started: [...started.values()], ended: [...ended.values()], session, analyzerEvents };
}

const maxStep = (frames, from, to) => {
  let m = 0;
  for (let i = 1; i < frames.length; i++) {
    if (frames[i].timestampMs >= from && frames[i - 1].timestampMs <= to) m = Math.max(m, frames[i].timestampMs - frames[i - 1].timestampMs);
  }
  return m;
};
const firstValidAt = (frames, absMs) => frames.find((f) => f.timestampMs >= absMs && f.ready && !f.dropout)?.timestampMs;

/** Check one labelled fixture; returns per-episode timing for rate reporting. */
function checkFixture(fx) {
  const r = run(fx.frames);
  const timings = [];
  if (fx.expected.noEpisodes) {
    assert.equal(r.session.episodes.length, 0, `${fx.name} fps ${fx.fps} seed ${fx.seed}: unexpected episodes ${JSON.stringify(r.session.episodes.map((e) => [e.type, e.startMs]))}`);
    if (fx.expected.unavailableReason) {
      for (const { out } of r.outputs) assert.equal(out.unavailableReason, fx.expected.unavailableReason);
    }
    return { r, timings };
  }
  const expectedEpisodes = fx.expected.episodes;
  assert.equal(r.session.episodes.length, expectedEpisodes.length,
    `${fx.name} fps ${fx.fps} seed ${fx.seed}: ${r.session.episodes.length} episodes ${JSON.stringify(r.session.episodes.map((e) => [e.type, e.startMs, e.endMs, e.endReason]))}`);
  const remaining = [...r.started];
  for (const exp of expectedEpisodes) {
    const idx = remaining.findIndex((s) => s.type === exp.type);
    assert.ok(idx >= 0, `${fx.name}: no ${exp.type} episode`);
    const s = remaining.splice(idx, 1)[0];
    const rule = CONTRACT.rules[exp.type];
    const onsetAbs = fx.startMs + exp.onsetMs;
    const firstValid = firstValidAt(fx.frames, onsetAbs);
    const step = maxStep(fx.frames, onsetAbs, onsetAbs + 1000);
    const latency = s.atMs - firstValid;
    if (!exp.lenientOnset) {
      assert.ok(latency >= rule.persistMs, `${fx.name} fps ${fx.fps} seed ${fx.seed}: ${exp.type} started ${latency} ms after onset (< ${rule.persistMs})`);
      assert.ok(latency < rule.persistMs + step + 1e-6, `${fx.name} fps ${fx.fps} seed ${fx.seed}: ${exp.type} started late (${latency} ms)`);
      assert.ok(s.startMs >= firstValid - step && s.startMs <= s.atMs);
    } else {
      assert.ok(latency >= 0 && s.atMs - firstValid <= rule.persistMs + step + 1e-6);
    }
    const end = r.ended.find((e) => e.id === s.id);
    const timing = { type: exp.type, onsetLatencyMs: latency, releaseLatencyMs: null };
    if (exp.endReason === 'resolved') {
      assert.ok(end, `${fx.name}: ${exp.type} never ended`);
      assert.equal(end.endReason, 'resolved');
      const offValid = firstValidAt(fx.frames, fx.startMs + exp.offMs);
      const rstep = maxStep(fx.frames, fx.startMs + exp.offMs, fx.startMs + exp.offMs + 1000);
      const rl = end.atMs - offValid;
      assert.ok(rl >= rule.releaseMs, `${fx.name} fps ${fx.fps} seed ${fx.seed}: ${exp.type} resolved ${rl} ms after release began (< ${rule.releaseMs})`);
      assert.ok(rl < rule.releaseMs + rstep + 1e-6, `${fx.name} fps ${fx.fps}: resolved late (${rl} ms)`);
      timing.releaseLatencyMs = rl;
    } else if (exp.endReason === 'tracking-lost') {
      assert.ok(end, `${fx.name}: ${exp.type} never ended`);
      assert.equal(end.endReason, 'tracking-lost');
      const lostFrom = fx.startMs + exp.lostFromMs;
      const lstep = maxStep(fx.frames, lostFrom, lostFrom + 1000);
      assert.ok(end.atMs - lostFrom <= CONTRACT.maxSuspendMs + 2 * lstep, `tracking-lost declared late (${end.atMs - lostFrom} ms)`);
      assert.ok(end.endMs <= lostFrom, 'tracking-lost endMs must be the last observed time, not inside the gap');
    }
    timings.push(timing);
  }
  if (fx.expected.suspendedDuring) {
    const [from, to] = fx.expected.suspendedDuring.map((ms) => fx.startMs + ms);
    const ep = r.session.episodes[0];
    for (const { frame, out } of r.outputs) {
      if (frame.timestampMs >= from && frame.timestampMs < to) {
        assert.equal(out.active.length, 1, 'open episode disappeared during a short dropout');
        assert.equal(out.active[0].episodeId, ep.id);
        assert.equal(out.active[0].state, 'suspended');
      }
    }
  }
  return { r, timings };
}

// ---------------------------------------------------------------------------------------------

test('config: curl-rules-1.0.0, frozen, all rules disabled and unvalidated with empty evidence, contract numbers', () => {
  assert.equal(CURL_RULES_CONFIG.version, 'curl-rules-1.0.0');
  assert.ok(Object.isFrozen(CURL_RULES_CONFIG));
  assert.equal(CURL_RULES_CONFIG.maxSuspendMs, CONTRACT.maxSuspendMs);
  assert.deepEqual(Object.keys(CURL_RULES_CONFIG.rules).sort(), [...TYPES].sort());
  for (const type of TYPES) {
    const rule = CURL_RULES_CONFIG.rules[type];
    assert.ok(Object.isFrozen(rule));
    assert.equal(rule.enabled, false, `${type} must ship disabled (no reviewed evidence)`);
    assert.equal(rule.validation, 'unvalidated');
    assert.deepEqual([...rule.evidence], []);
    assert.equal(rule.supportedView, 'side');
    assert.equal(rule.cueText, CONTRACT.rules[type].text);
  }
  for (const type of ['torso-swing', 'upper-arm-drift']) {
    const rule = CURL_RULES_CONFIG.rules[type];
    const c = CONTRACT.rules[type];
    assert.deepEqual([rule.onsetDeg, rule.onsetPersistMs, rule.releaseDeg, rule.releasePersistMs], [c.onsetDeg, c.persistMs, c.releaseDeg, c.releaseMs]);
  }
  assert.equal(CURL_RULES_CONFIG.rules['torso-swing'].feature, 'torsoDeviationDeg');
  assert.equal(CURL_RULES_CONFIG.rules['upper-arm-drift'].feature, 'upperArmDriftDeg');
  assert.throws(() => createCurlIssueTracker({ config: { rules: { 'wrist-flare': {} } } }));
  assert.throws(() => createCurlIssueTracker({ config: { maxSuspendMs: 0 } }));
});

test('synthetic labelled fixtures pass at 15, 30 and 60 fps (one seed)', () => {
  for (const fps of FPS) for (const fx of buildCoachingFixtures({ fps, seed: 3 })) checkFixture(fx);
});

test('synthetic: rates across 20 seeds x 15/30/60 fps: spikes never open an episode; onset/release latency within one frame of persistence', (t) => {
  const report = [];
  for (const fps of FPS) {
    let spikeRuns = 0, spikeEpisodes = 0;
    const onset = [], release = [];
    let failures = 0;
    for (const seed of SEEDS) {
      for (const fx of buildCoachingFixtures({ fps, seed })) {
        let res;
        try { res = checkFixture(fx); } catch (error) { failures += 1; throw error; }
        if (fx.name.startsWith('spikes-')) { spikeRuns += 1; spikeEpisodes += res.r.session.episodes.length; }
        for (const tm of res.timings) {
          if (Number.isFinite(tm.onsetLatencyMs)) onset.push(tm.onsetLatencyMs);
          if (Number.isFinite(tm.releaseLatencyMs)) release.push(tm.releaseLatencyMs);
        }
      }
    }
    const stats = (xs) => xs.length ? `min ${Math.min(...xs).toFixed(0)} / max ${Math.max(...xs).toFixed(0)} ms (n=${xs.length})` : 'n/a';
    report.push(`fps ${fps}: spike streams ${spikeRuns}, episodes from spikes ${spikeEpisodes} (rate ${(spikeEpisodes / spikeRuns).toFixed(3)}), fixture failures ${failures}; onset latency ${stats(onset)}; release latency ${stats(release)}`);
  }
  for (const line of report) t.diagnostic(`SYNTHETIC ${line}`);
});

test('synthetic: background noise sweep (no deviation, noise 1-3 deg) opens no episode across seeds and fps', (t) => {
  let runs = 0, episodes = 0;
  for (const fps of FPS) for (const noiseDeg of [1, 2, 3]) for (const seed of SEEDS) {
    const frames = stream({ seed, fps, noiseDeg, durationMs: 15000 });
    episodes += run(frames).session.episodes.length;
    runs += 1;
  }
  t.diagnostic(`SYNTHETIC noise sweep: ${runs} streams of 15 s, ${episodes} episodes`);
  assert.equal(episodes, 0);
});

test('synthetic: spikes up to 380 ms (just under the 400 ms persistence) never start an episode at any fps', () => {
  for (const fps of FPS) for (const seed of SEEDS.slice(0, 10)) {
    const spikes = randomSpikes({ seed, durationMs: 20000, type: 'torso-swing', deg: 30, minMs: 300, maxMs: 380, everyMs: 1500 });
    const r = run(stream({ seed, fps, durationMs: 20000, spikes }));
    assert.equal(r.session.episodes.length, 0, `fps ${fps} seed ${seed}`);
  }
});

test('synthetic: a frame stall (no frames) longer than the evidence gap restarts onset evidence', () => {
  // Torso at 15 deg; 300 ms of frames, a 600 ms stall with no frames, then more frames at 15 deg.
  const before = stream({ seed: 5, fps: 30, durationMs: 300, torso: () => 15 });
  const after = stream({ seed: 6, fps: 30, startMs: 1900, durationMs: 1500, torso: () => 15 });
  const r = run([...before, ...after]);
  assert.equal(r.started.length, 1);
  assert.ok(r.started[0].startMs >= 1900, 'evidence from before the stall was carried across it');
  assert.ok(r.started[0].atMs - after[0].timestampMs >= 400);
});

test('synthetic: a frame stall longer than maxSuspendMs ends an open episode tracking-lost, never resolved', () => {
  const before = stream({ seed: 7, fps: 30, durationMs: 1500, torso: () => 15 });
  const after = stream({ seed: 8, fps: 30, startMs: 3200, durationMs: 1500, torso: () => 0 });
  const r = run([...before, ...after]);
  assert.equal(r.ended.length, 1);
  assert.equal(r.ended[0].endReason, 'tracking-lost');
  assert.ok(r.ended[0].endMs <= before.at(-1).timestampMs);
});

test('synthetic: unsupported view, calibrating and dropout frames report the right unavailableReason', () => {
  const mk = (opts) => run(stream({ seed: 9, fps: 30, durationMs: 1000, torso: () => 15, ...opts })).outputs.map((o) => o.out.unavailableReason);
  assert.ok(mk({ view: () => 'front' }).every((r) => r === 'unsupported-view'));
  assert.ok(mk({ tracking: () => 'dropout' }).every((r) => r === 'tracking-dropout'));
  assert.ok(mk({ tracking: () => 'calibrating' }).every((r) => r === 'calibration-required'));
  assert.ok(mk({}).every((r) => r === null));
});

test('synthetic: a missing feature value (null torso) is not assessable for that rule and is not read as resolved', () => {
  // torso 15 for 2 s, then the torso feature goes null (e.g. hip hidden) for 2 s while drift stays valid.
  const frames = stream({ seed: 10, fps: 30, durationMs: 4000, torso: () => 15 });
  for (const f of frames) if (f.timestampMs >= 3000) { f.values.torsoDeviationDeg = null; f.validity.torsoDeviationDeg = false; }
  const r = run(frames);
  assert.equal(r.started.length, 1);
  const end = r.ended[0];
  assert.ok(end, 'episode should end after > maxSuspendMs without the feature');
  assert.equal(end.endReason, 'tracking-lost');
});

test('interrupt, end and reset end open episodes with the contract reasons (never resolved) and keep IDs unique', () => {
  const frames = stream({ seed: 11, fps: 30, durationMs: 2000, torso: () => 15 });
  const tracker = createCurlIssueTracker();
  const r = run(frames, { tracker });
  assert.equal(r.started.length, 1);
  const out = tracker.interrupt('tracking-loss', frames.at(-1).timestampMs);
  assert.equal(out.assessable, false);
  assert.deepEqual(out.events.map((e) => [e.type, e.episode.endReason]), [['issue-ended', 'tracking-lost']]);
  assert.equal(out.active.length, 0);
  assert.equal(tracker.interrupt('recalibration').events.length, 0, 'nothing left to end');
  assert.throws(() => tracker.interrupt('bogus'));

  // After the interrupt, the same sustained deviation needs a full new persistence period.
  const more = stream({ seed: 12, fps: 30, startMs: frames.at(-1).timestampMs + 33, durationMs: 1500, torso: () => 15 });
  const r2 = run(more, { tracker, analyzer: r.analyzer });
  assert.equal(r2.started.length, 1);
  assert.ok(r2.started[0].atMs - more[0].timestampMs >= 400);
  assert.notEqual(r2.started[0].id, r.started[0].id);

  const rec = tracker.interrupt('recalibration');
  assert.deepEqual(rec.events.map((e) => e.episode.endReason), ['recalibration']);
  assert.equal(rec.unavailableReason, 'recalibration');

  const more2 = stream({ seed: 13, fps: 30, startMs: more.at(-1).timestampMs + 33, durationMs: 1500, torso: () => 15 });
  run(more2, { tracker, analyzer: r.analyzer });
  const endOut = tracker.end(more2.at(-1).timestampMs + 10);
  assert.deepEqual(endOut.events.map((e) => e.episode.endReason), ['set-ended']);
  // Frames after end are ignored.
  const after = stream({ seed: 14, fps: 30, startMs: more2.at(-1).timestampMs + 100, durationMs: 1500, torso: () => 15 });
  for (const f of after) assert.equal(tracker.update(f, r.analyzer.update(f)).events.length, 0);
  const session = tracker.getSession();
  assert.deepEqual(session.episodes.map((e) => e.endReason), ['tracking-lost', 'recalibration', 'set-ended']);
  assert.ok(session.episodes.every((e) => e.endReason !== 'resolved'));
  const oldIds = session.episodes.map((e) => e.id);

  // reset: new session id, open episodes of the old session end 'reset', new ids never collide.
  const tracker2 = createCurlIssueTracker();
  const r3 = run(stream({ seed: 15, fps: 30, durationMs: 2000, torso: () => 15 }), { tracker: tracker2 });
  const sid = tracker2.getSession().sessionId;
  const resetOut = tracker2.reset('restart');
  assert.deepEqual(resetOut.events.map((e) => e.episode.endReason), ['reset']);
  assert.equal(resetOut.events[0].episode.id, r3.started[0].id);
  assert.notEqual(tracker2.getSession().sessionId, sid);
  assert.equal(tracker2.getSession().episodes.length, 0);
  const r4 = run(stream({ seed: 16, fps: 30, durationMs: 2000, torso: () => 15 }), { tracker: tracker2 });
  const all = [...oldIds, r3.started[0].id, r4.started[0].id];
  assert.equal(new Set(all).size, all.length);
});

test('episode ids are issue-<sessionUid>-<n>, unique across trackers and resets', () => {
  const ids = [];
  for (let i = 0; i < 5; i++) {
    const tracker = createCurlIssueTracker();
    for (let k = 0; k < 3; k++) {
      ids.push(...run(buildCoachingFixtures({ fps: 30, seed: i + 1 }).find((f) => f.name === 'overlap-both').frames, { tracker }).started.map((s) => s.id));
      tracker.reset();
    }
  }
  assert.equal(ids.length, 30);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^issue-.+-\d+$/);
  const uids = new Set(ids.map((id) => id.replace(/^issue-/, '').replace(/-\d+$/, '')));
  assert.equal(uids.size, 15, 'each tracker session must have its own uid');
  for (const uid of uids) assert.doesNotMatch(uid, /^\d+$/, 'uid must not be a page counter');
});

test('rep and attempt ids are curl-<sessionUid>-<n> (Sprint 3 D7), unique across analyzer instances', () => {
  const frames = render({ seed: 31, script: [{ ms: 800 }, ...curl(), ...curl({ excursion: 50 }), ...curl()] });
  const ids = [];
  const uids = new Set();
  for (let i = 0; i < 3; i++) {
    const r = run(frames);
    const events = r.analyzerEvents;
    assert.equal(events.filter((e) => e.type === 'rep-completed').length, 2);
    for (const e of events) {
      assert.match(e.id, /^curl-.+-\d+$/);
      assert.doesNotMatch(e.id, /^curl-\d+-\d+$/, 'old page-counter id format');
      ids.push(e.id);
      uids.add(e.id.replace(/^curl-/, '').replace(/-\d+$/, ''));
    }
    assert.equal(r.analyzer.getSession().sessionId, [...uids].at(-1));
  }
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(uids.size, 3);
});

test('synthetic: incomplete-rom only from partial attempts, as an instant episode with the attempt id', () => {
  // Two partial attempts (40% and 45% excursion), one full curl, then a mid-rep loss (tracking-loss interruption).
  const frames = render({ seed: 41, script: [{ ms: 800 }, ...curl({ excursion: 50, durationMs: 1600 }), ...curl({ excursion: 55, durationMs: 1600 }),
    ...curl({ durationMs: 2200 }), { ms: 500, to: 70 }, { ms: 1500, tracking: 'lost' }, { ms: 1000, to: 10, tracking: 'calibrating' }, { ms: 800 }] });
  const r = run(frames);
  const partials = r.analyzerEvents.filter((e) => e.type === 'attempt-interrupted' && e.attempt.reason === 'partial');
  const others = r.analyzerEvents.filter((e) => e.type === 'attempt-interrupted' && e.attempt.reason !== 'partial');
  assert.equal(partials.length, 2);
  assert.ok(others.length >= 1, 'fixture should contain a non-partial interruption');
  const rom = r.session.episodes.filter((e) => e.type === 'incomplete-rom');
  assert.equal(rom.length, 2);
  for (const [i, ep] of rom.entries()) {
    assert.equal(ep.startMs, ep.endMs);
    assert.equal(ep.startMs, partials[i].attempt.endMs);
    assert.equal(ep.endReason, 'evaluated-at-attempt-end');
    assert.deepEqual(ep.attemptIds, [partials[i].id]);
    assert.equal(ep.peak, partials[i].attempt.romDeg);
    assert.equal(ep.enabled, false);
  }
  // Started and ended in the same frame; never in `active`.
  for (const ep of rom) {
    const s = r.started.find((x) => x.id === ep.id), e = r.ended.find((x) => x.id === ep.id);
    assert.equal(s.atMs, e.atMs);
  }
  for (const { out } of r.outputs) assert.ok(!out.active.some((a) => a.type === 'incomplete-rom'));
});

test('synthetic: full reps never produce incomplete-rom; torso episodes list the overlapping rep ids', () => {
  const frames = curlsWithIssues({ seed: 51, reps: [{ torso: 20, durationMs: 3000 }, {}, { torso: 20, durationMs: 3000 }] });
  const r = run(frames);
  const reps = r.analyzerEvents.filter((e) => e.type === 'rep-completed');
  assert.equal(reps.length, 3);
  assert.equal(r.session.episodes.filter((e) => e.type === 'incomplete-rom').length, 0);
  const torso = r.session.episodes.filter((e) => e.type === 'torso-swing');
  assert.equal(torso.length, 2, JSON.stringify(torso.map((e) => [e.startMs, e.endMs])));
  assert.ok(torso[0].attemptIds.includes(reps[0].id), 'first episode should list rep 1');
  assert.ok(torso[1].attemptIds.includes(reps[2].id), 'second episode should list rep 3');
  for (const ep of torso) assert.ok(!ep.attemptIds.includes(reps[1].id), 'clean rep 2 listed on an episode');
});

const withoutId = (episode) => { const rest = { ...episode }; delete rest.id; return rest; };

test('synthetic: duplicate timestamps (with spike values) and out-of-order frames are ignored', () => {
  const fx = buildCoachingFixtures({ fps: 30, seed: 2 }).find((f) => f.name === 'sustained-torso');
  const clean = run(fx.frames).session.episodes;
  // Duplicates of every 3rd frame carrying a 40 deg torso spike (or a 0 deg dip) must change nothing.
  const dup = [];
  fx.frames.forEach((f, i) => {
    dup.push(f);
    if (i % 3 === 0) { const d = structuredClone(f); d.values.torsoDeviationDeg = i % 2 ? 40 : 0; dup.push(d); }
  });
  const withDup = run(dup).session.episodes;
  assert.deepEqual(withDup.map(withoutId), clean.map(withoutId));
  // A single late frame at a stale timestamp does not count either.
  const late = [...fx.frames];
  const stale = structuredClone(late[100]); stale.values.torsoDeviationDeg = 40;
  late.splice(140, 0, stale);
  assert.deepEqual(run(late).session.episodes.map(withoutId), clean.map(withoutId));
  // NaN timestamp is ignored.
  const tracker = createCurlIssueTracker();
  const bad = structuredClone(fx.frames[0]); bad.timestampMs = Number.NaN;
  assert.equal(tracker.update(bad, createCurlAnalyzer().update(bad)).events.length, 0);
  assert.equal(tracker.getSession().startedMs, null);
});

test('synthetic: assessableIntervals cover valid time and exclude dropouts', () => {
  const fx = buildCoachingFixtures({ fps: 30, seed: 4 }).find((f) => f.name === 'dropout-during-episode');
  const s = run(fx.frames).session;
  assert.ok(s.assessableIntervals.length >= 2);
  for (const iv of s.assessableIntervals) {
    assert.ok(iv.endMs >= iv.startMs);
    assert.ok(iv.endMs <= fx.startMs + 3000 + 1 || iv.startMs >= fx.startMs + 3300 - 1, `interval ${JSON.stringify(iv)} crosses the dropout`);
  }
  const total = s.assessableIntervals.reduce((acc, iv) => acc + iv.endMs - iv.startMs, 0);
  const span = s.lastMs - s.startedMs;
  assert.ok(total <= span - 300 + 70 && total >= span - 300 - 150, `assessable ${total} of ${span}`);
});

test('synthetic: rule hysteresis - values between release and onset keep the episode open; a 400 ms level just above onset starts it', () => {
  const fx = buildCoachingFixtures({ fps: 30, seed: 6 }).find((f) => f.name === 'hysteresis-band');
  const { r } = checkFixture(fx);
  assert.equal(r.session.episodes.length, 1);
  // A level of 9 deg (below onset) never starts an episode.
  const below = run(stream({ seed: 61, fps: 30, durationMs: 6000, noiseDeg: 0.3, torso: steps([[0, 0], [1000, 9]]) }));
  assert.equal(below.session.episodes.length, 0);
});

test('synthetic: resolved episodes end at the first frame of the release run; other reasons at the last assessable frame', () => {
  const fx = buildCoachingFixtures({ fps: 30, seed: 8 }).find((f) => f.name === 'sustained-torso');
  const ep = run(fx.frames).session.episodes[0];
  assert.equal(ep.endReason, 'resolved');
  assert.equal(ep.endMs, firstValidAt(fx.frames, fx.startMs + 4000));
  const lost = buildCoachingFixtures({ fps: 30, seed: 8 }).find((f) => f.name === 'loss-during-episode');
  const lep = run(lost.frames).session.episodes[0];
  assert.equal(lep.endReason, 'tracking-lost');
  assert.equal(lep.endMs, lost.frames.filter((f) => f.timestampMs < lost.startMs + 3000).at(-1).timestampMs);
});

test('config override enables a rule for the tracker without touching the frozen default', () => {
  const tracker = createCurlIssueTracker({ config: { rules: { 'torso-swing': { enabled: true } } } });
  const frames = stream({ seed: 71, fps: 30, durationMs: 1500, torso: () => 15 });
  const analyzer = createCurlAnalyzer();
  let out;
  for (const f of frames) out = tracker.update(f, analyzer.update(f));
  assert.equal(out.active[0].enabled, true);
  assert.equal(out.active[0].validation, 'unvalidated');
  assert.equal(CURL_RULES_CONFIG.rules['torso-swing'].enabled, false);
});

test("synthetic (D1): at 5-6 fps frames are 'low-frame-rate' (not assessable) and no episode starts; at 8 and 10 fps every seed opens one", (t) => {
  assert.equal(CURL_RULES_CONFIG.maxEvidenceGapMs, 150);
  assert.equal(CURL_RULES_CONFIG.frameRateWindowMs, 1000);
  const rows = [];
  for (const fps of [5, 6, 8, 10]) {
    let opened = 0, lowFrames = 0, total = 0;
    for (const seed of SEEDS.slice(0, 10)) {
      const r = run(stream({ seed, fps, spacingJitter: 0.05, durationMs: 5000, torso: () => 15 }));
      opened += r.session.episodes.length > 0 ? 1 : 0;
      // After the first two intervals the window holds enough gaps to judge the frame rate.
      for (const { out } of r.outputs.slice(3)) { total += 1; if (out.unavailableReason === 'low-frame-rate') lowFrames += 1; }
    }
    rows.push(`${fps} fps: episode opened in ${opened}/10 seeds; low-frame-rate on ${lowFrames}/${total} frames after warm-up`);
    if (fps <= 6) { assert.equal(opened, 0); assert.equal(lowFrames, total); }
    if (fps >= 8) { assert.equal(opened, 10); assert.equal(lowFrames, 0); }
  }
  for (const r of rows) t.diagnostic(`SYNTHETIC low-fps: ${r}`);
});

test('synthetic (D1): a single long gap in a 30 fps stream does not switch to low-frame-rate', () => {
  const a = stream({ seed: 101, fps: 30, durationMs: 2000, torso: () => 0 });
  const b = stream({ seed: 102, fps: 30, startMs: a.at(-1).timestampMs + 400, durationMs: 2000, torso: () => 0 });
  const r = run([...a, ...b]);
  assert.ok(r.outputs.every(({ out }) => out.unavailableReason !== 'low-frame-rate'));
  assert.ok(r.outputs.every(({ out }) => out.assessable));
});

test("synthetic (D1): a drop to low fps suspends an open episode, which ends 'tracking-lost' (never resolved); recovery when fps returns", () => {
  // 30 fps with torso 15 deg for 2 s (episode opens), then 5 fps for 2 s (torso back to 0: must not resolve),
  // then 30 fps again with torso 15 deg (a new episode may open).
  const fast1 = stream({ seed: 111, fps: 30, durationMs: 2000, torso: () => 15 });
  const slow = stream({ seed: 112, fps: 5, spacingJitter: 0.05, startMs: fast1.at(-1).timestampMs + 200, durationMs: 2000, torso: () => 0 });
  const fast2 = stream({ seed: 113, fps: 30, startMs: slow.at(-1).timestampMs + 33, durationMs: 2500, torso: () => 15 });
  const r = run([...fast1, ...slow, ...fast2]);
  const first = r.session.episodes[0];
  assert.equal(first.type, 'torso-swing');
  assert.equal(first.endReason, 'tracking-lost');
  assert.ok(r.session.episodes.every((e) => e.endReason !== 'resolved'));
  const slowOuts = r.outputs.filter(({ frame }) => frame.timestampMs >= slow[0].timestampMs && frame.timestampMs <= slow.at(-1).timestampMs);
  assert.ok(slowOuts.slice(2).some(({ out }) => out.unavailableReason === 'low-frame-rate'));
  for (const { out } of slowOuts) for (const a of out.active) if (!out.assessable) assert.equal(a.state, 'suspended');
  // Recovery: once 30 fps returns, frames are assessable again and a new episode opens.
  const lateOuts = r.outputs.filter(({ frame }) => frame.timestampMs >= fast2[0].timestampMs + 1100);
  assert.ok(lateOuts.every(({ out }) => out.assessable));
  assert.equal(r.session.episodes.length, 2);
  assert.notEqual(r.session.episodes[1].id, first.id);
  assert.ok(r.session.episodes[1].startMs >= fast2[0].timestampMs);
});

test('interrupt(reason, t, analyzerEvents) and end(t, analyzerEvents) attach the interrupted attempt to overlapping episodes', () => {
  // Torso 20 deg during a lift that never completes; the UI interrupts the analyzer, then the tracker.
  for (const which of ['interrupt', 'end']) {
    const frames = render({ seed: 121, script: [{ ms: 800 }, { ms: 1500, to: 90, torso: 20 }, { ms: 600 }] });
    const analyzer = createCurlAnalyzer(), tracker = createCurlIssueTracker();
    for (const f of frames) tracker.update(f, analyzer.update(f));
    const open = tracker.getSession().episodes[0];
    assert.ok(open && open.endReason === null, 'episode open before the interrupt');
    const aOut = analyzer.interrupt('tracking-loss');
    assert.equal(aOut.events.length, 1);
    const attemptId = aOut.events[0].id;
    const out = which === 'interrupt' ? tracker.interrupt('tracking-loss', undefined, aOut.events) : tracker.end(undefined, aOut.events);
    const ended = out.events.find((e) => e.type === 'issue-ended').episode;
    assert.equal(ended.endReason, which === 'interrupt' ? 'tracking-lost' : 'set-ended');
    assert.ok(ended.attemptIds.includes(attemptId), `${which}: attempt id not attached`);
  }
  // Without events: unchanged behaviour.
  const tracker = createCurlIssueTracker();
  const analyzer = createCurlAnalyzer();
  for (const f of stream({ seed: 122, fps: 30, durationMs: 1500, torso: () => 15 })) tracker.update(f, analyzer.update(f));
  assert.deepEqual(tracker.interrupt('recalibration').events.map((e) => e.episode.endReason), ['recalibration']);
  assert.equal(tracker.end().events.length, 0);
});

test('rep ids stay unique across analyzer resets within one instance', () => {
  const analyzer = createCurlAnalyzer();
  const ids = [];
  for (let k = 0; k < 3; k++) {
    for (const f of render({ seed: 80 + k, script: [{ ms: 800 }, ...curl(), ...curl()] })) ids.push(...analyzer.update(f).events.map((e) => e.id));
    analyzer.reset('restart');
  }
  assert.equal(ids.length, 6);
  assert.equal(new Set(ids).size, 6);
});
