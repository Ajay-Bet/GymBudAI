import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import CoachingPanel from '../../src/components/CoachingPanel.jsx';
import SetControls from '../../src/components/SetControls.jsx';
import CalibrationProgress from '../../src/components/CalibrationProgress.jsx';
import SetFeedbackPanel from '../../src/components/SetFeedbackPanel.jsx';
import { describeSetFeedback } from '../../src/feedback/setFeedbackText.js';

afterEach(cleanup);
describe('coaching extension panels', () => {
  it('defaults to text and gates AI voice on both capability and audio choice', () => {
    const change = vi.fn();
    const { rerender } = render(<CoachingPanel onOutputModeChange={change} reviewMode={false} />);
    expect(screen.getByRole('radio', { name: 'Text' }).checked).toBe(true);
    expect(screen.queryByText(/Natural AI voice/)).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: 'Audio + text' }));
    expect(change).toHaveBeenCalledWith('audio-text');
    rerender(<CoachingPanel outputMode="audio-text" aiVoiceAvailable aiVoice voiceAvailable onOutputModeChange={change} reviewMode={false} />);
    expect(screen.getByText('Voice is AI-generated (OpenAI)')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mute voice' }).disabled).toBe(false);
  });
  it('separates a paused set from explicit finish and next set', () => {
    const finish = vi.fn(), next = vi.fn();
    const { rerender } = render(<SetControls state="paused" setNumber={1} canFinish onFinish={finish} onStartNext={next} />);
    expect(screen.getByText('Set paused — camera off')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start next set' }).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Finish set' }));
    expect(finish).toHaveBeenCalledOnce();
    rerender(<SetControls state="finished" setNumber={1} canFinish onFinish={finish} onStartNext={next} />);
    expect(screen.getByRole('button', { name: 'Finish set' }).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Start next set' }));
    expect(next).toHaveBeenCalledOnce();
  });
  it('shows specific blocking calibration guidance with accessible progress', () => {
    render(<CalibrationProgress cameraOn side="left" calibration={{ status: 'collecting', progress: 0.6, blockedReason: 'joints-not-visible:elbow' }} />);
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('60');
    expect(screen.getByText('Move so your left elbow is clearly in view.')).toBeTruthy();
  });
  it('keeps unavailable deterministic score and fallback when AI wording fails', () => {
    const summary = { completedReps: 2, analyzedReps: 0, trackingCoverage: { fraction: 0.9 }, assessedRuleTypes: [], setIndex: 1, side: 'left' };
    const score = { available: false, reason: 'no-validated-rules' };
    const findings = { strengths: [{ code: 'completed-reps', values: { completedReps: 2 } }], improvements: [], focus: null };
    const text = describeSetFeedback(findings, score, summary);
    const replay = vi.fn(), stop = vi.fn();
    render(<SetFeedbackPanel result={{ summary, score, findings }} text={text} wording={{ status: 'failed' }} wordingAvailable audioMode narrationStatus="speaking" onReplayNarration={replay} onStopNarration={stop} />);
    expect(screen.getByText(/no form check has been validated yet/)).toBeTruthy();
    expect(screen.getByText(/Your original feedback is kept/)).toBeTruthy();
    expect(screen.queryByText(/100 \/ 100/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Replay narration' }));
    fireEvent.click(screen.getByRole('button', { name: 'Stop narration' }));
    expect(replay).toHaveBeenCalledOnce();
    expect(stop).toHaveBeenCalledOnce();
  });
});
