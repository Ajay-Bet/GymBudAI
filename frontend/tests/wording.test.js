// Strict approved-paraphrase grounding with synthetic deterministic set facts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAiWordingFacts, approvedWordingOptions, validateAiWording, requestAiWording } from '../src/feedback/wording.js';
import { buildSetFindings } from '../src/exercises/setFindings.js';
import { scoreSet } from '../src/exercises/setScore.js';
import { summary, ep, repWindow } from './fixtures/set-fixtures.js';
const sm = summary({ episodes: [ep('torso-swing', repWindow(0).startMs + 300, repWindow(0).startMs + 900)] });
const score = scoreSet(sm);
const facts = buildAiWordingFacts({ summary: sm, score, findings: buildSetFindings(sm, score) });
function output(f = facts, variant = 0) {
  const opts = approvedWordingOptions(f);
  const o = { headline: opts.headline[variant], strengths: opts.strengths.map((x) => x[variant]), improvements: opts.improvements.map((x) => x[variant]), focus: opts.focus?.[variant] ?? null };
  return { ...o, narration: [o.headline, ...o.strengths.slice(0, 1), ...(o.focus ? [o.focus] : [])].join(' ') };
}
test('Only codes/numeric facts and minimal deterministic score leave browser', () => {
  assert.deepEqual(Object.keys(facts).sort(), ['findings', 'score']);
  for (const f of [...facts.findings.strengths, ...facts.findings.improvements, facts.findings.focus]) {
    assert.equal(Object.hasOwn(f.values, 'type'), false);
    assert.ok(Object.values(f.values).every((v) => typeof v === 'number' && Number.isFinite(v)));
  }
  assert.deepEqual(Object.keys(facts.score).sort(), ['available', 'experimental', 'reason', 'value']);
});
test('Both variants are grounded per finding, with experimental audio disclosure', () => {
  for (const variant of [0, 1]) {
    const o = output(facts, variant); assert.equal(validateAiWording(o, facts), true);
    assert.match(o.narration, /^Experimental review with unvalidated rules:/);
    assert.ok(o.narration.length <= 300);
  }
});
test('Reject hallucinated prose even when it contains no numbers/blacklisted terms', () => {
  for (const field of ['headline', 'focus', 'narration']) assert.equal(validateAiWording({ ...output(), [field]: 'Your shoulders moved evenly throughout.' }, facts), false);
  const swapped = output(); swapped.strengths[0] = swapped.improvements[0];
  assert.equal(validateAiWording(swapped, facts), false);
  assert.equal(validateAiWording({ ...output(), score: 100 }, facts), false);
  assert.equal(validateAiWording({ ...output(), strengths: [] }, facts), false);
});
test('Reject changed counts and edited narration; preserve deterministic unavailable score', () => {
  const o = output(); o.strengths[0] = o.strengths[0].replace('4', '9');
  assert.equal(validateAiWording(o, facts), false);
  const v = summary({ mode: 'validated-only' }); const sc = scoreSet(v);
  const unavailable = buildAiWordingFacts({ summary: v, score: sc, findings: buildSetFindings(v, sc) });
  assert.equal(unavailable.score.value, null); assert.equal(validateAiWording(output(unavailable), unavailable), true);
  assert.equal(validateAiWording({ ...output(unavailable), narration: 'Your form score is 100.' }, unavailable), false);
});
test('API failure, invalid output, timeout and abort retain deterministic fallback', async () => {
  assert.equal(await requestAiWording(facts, { client: async () => output() }).then(Boolean), true);
  assert.equal(await requestAiWording(facts, { client: async () => { throw new Error('offline'); } }), null);
  assert.equal(await requestAiWording(facts, { client: async () => ({}) }), null);
  assert.equal(await requestAiWording(facts, { client: () => new Promise(() => {}), timeoutMs: 5 }), null);
  const controller = new AbortController(); let resolveLate, signal;
  const pending = requestAiWording(facts, { signal: controller.signal, client: (_f, opts) => { signal = opts.signal; return new Promise((r) => { resolveLate = r; }); } });
  await Promise.resolve(); controller.abort(); assert.equal(await pending, null); assert.equal(signal.aborted, true);
  resolveLate(output());
  let requests = 0;
  assert.equal(await requestAiWording(facts, { signal: controller.signal, client: async () => { requests++; } }), null); assert.equal(requests, 0);
});
