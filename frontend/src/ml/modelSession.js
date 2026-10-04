import { aggregateRepFeatures, aggregateWindowFeatures } from './repFeatures.js';
import { predictRep } from './model.js';

/** Rep-end only: no full-rep feature can generate a within-rep correction. */
export function createModelSession() {
  let model = null, mode = 'rules-only', frames = [], records = [], seen = new Set(), error = null;
  const state = () => {
    const completed = records.filter((x) => x.completed);
    const assessed = completed.filter((x) => x.assessed);
    const eligible = !error && assessed.length >= 3 && assessed.length / Math.max(1, completed.length) >= 0.8;
    const issueBearing = assessed.filter((x) => x.predictions.some((p) => p.detected)).length;
    return { mode, modelVersion: model?.modelVersion ?? null, status: error ? 'fallback' : model ? 'loaded-experimental' : 'unavailable', error,
      records: [...records], summary: { experimental: true, labelScope: model?.labels.map((x) => x.name) ?? [], completed: completed.length,
        assessed: assessed.length, issueBearing, score: eligible ? Math.round(100 * (assessed.length - issueBearing) / assessed.length) : null,
        reason: eligible ? null : 'Need at least 3 assessed completed reps and 80% model coverage.' } };
  };
  const interrupt = () => { frames = []; };
  return {
    getState: state,
    setModel(value) { model = value; error = null; this.reset(); },
    setMode(value) {
      if (!['rules-only', 'experimental-model'].includes(value)) throw new Error('Unknown model mode.');
      if (value === 'experimental-model' && !model) throw new Error('Load a trained model first.');
      mode = value; this.reset();
    },
    reset() { frames = []; records = []; seen = new Set(); },
    interrupt,
    update(frame, analyzerOutput, ruleOutput) {
      const fallback = () => ({ ...ruleOutput, active: (ruleOutput?.active ?? []).filter((x) => x.enabled), events: (ruleOutput?.events ?? []).filter((x) => x.episode?.enabled) });
      if (mode !== 'experimental-model' || !model) return ruleOutput;
      const recordUnassessed = (reason) => {
        for (const event of analyzerOutput?.events ?? []) if (event.type === 'rep-completed' && !records.some((x) => x.id === event.id)) {
          seen.add(event.id); records.push({ id: event.id, completed: true, assessed: false, reason, predictions: [] });
        }
      };
      if (error) { recordUnassessed('inference-failed'); return fallback(); }
      // Keep invalid observations in the same bounded history used offline: a graced
      // dropout reduces observed coverage without discarding the earlier valid motion.
      // An actual attempt interruption (or the UI's interrupt()) ends that history.
      if ((analyzerOutput?.events ?? []).some((event) => event.type === 'attempt-interrupted' && event.attempt?.reason !== 'partial')) interrupt();
      if (Number.isFinite(frame?.timestampMs)) {
        frames.push(frame);
        frames = frames.filter((x) => frame.timestampMs - x.timestampMs <= 30000).slice(-4000);
      }
      if (!frame?.ready || !ruleOutput?.assessable) {
        for (const event of analyzerOutput?.events ?? []) if (event.type === 'rep-completed' && !seen.has(event.id)) {
          seen.add(event.id); records.push({ id: event.id, completed: true, assessed: false, reason: 'tracking-gate', predictions: [] });
        }
        return { ...ruleOutput, active: [], events: [] };
      }
      const events = [];
      try {
        for (const event of analyzerOutput?.events ?? []) {
          const rep = event.rep ?? event.attempt;
          const completed = event.type === 'rep-completed';
          const partial = event.type === 'attempt-interrupted' && rep?.reason === 'partial';
          if ((!completed && !partial) || !rep || seen.has(event.id)) continue;
          seen.add(event.id);
          const aggregate = model.featureSchemaVersion === 'rep-end-v2' ? aggregateWindowFeatures : aggregateRepFeatures;
          const result = predictRep(model, aggregate(frames, { startMs: rep.startMs, endMs: rep.endMs }), { view: frame.view });
          // Partial attempts may only receive end-of-attempt ROM assessment, never a complete-rep score.
          if (!completed) result.predictions = result.predictions.filter((p) => p.issueType === 'incomplete-rom');
          records.push({ id: event.id, completed, ...result });
          if (result.assessed) for (const p of result.predictions.filter((x) => x.detected)) {
            const type = p.issueType ?? (p.label === 'swinging' ? 'swinging' : null);
            if (!type) continue; // Unmapped semantics remain an observation in the panel only.
            events.push({ type: 'issue-ended', episode: { id: `model-${model.modelVersion}-${event.id}-${p.label}`, type,
              startMs: rep.endMs, endMs: rep.endMs, endReason: 'evaluated-at-attempt-end', validation: 'experimental-model', enabled: false } });
          }
        }
      } catch (failure) {
        error = `Model inference failed: ${failure.message}. Using rules-only fallback.`;
        recordUnassessed('inference-failed');
        interrupt();
        return fallback();
      }
      return { ...ruleOutput, active: [], events };
    },
  };
}
