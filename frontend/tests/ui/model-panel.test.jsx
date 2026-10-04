import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ExperimentalModelPanel from '../../src/components/ExperimentalModelPanel.jsx';
afterEach(cleanup);
describe('experimental model controls', () => {
  it('unavailable model keeps experimental mode disabled and rules fallback visible', () => {
    render(<ExperimentalModelPanel state={{ mode: 'rules-only', status: 'unavailable' }} onLoad={vi.fn()} onModeChange={vi.fn()} />);
    expect(screen.getByRole('option', { name: /Experimental model/ }).disabled).toBe(true);
    expect(screen.getByText(/No trained model loaded/)).toBeTruthy();
  });
  it('reports invalid file and supports explicit local versioned artifact loading', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('Model checksum mismatch.')).mockResolvedValueOnce({});
    render(<ExperimentalModelPanel state={{ mode: 'rules-only' }} onLoad={load} onModeChange={vi.fn()} />);
    const input = screen.getByLabelText(/Model artifact/);
    fireEvent.change(input, { target: { files: [{ size: 20, text: async () => '{"trained":false}' }] } });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('checksum'));
    fireEvent.change(input, { target: { files: [{ size: 20, text: async () => '{"modelVersion":"pilot"}' }] } });
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  });
  it('loaded model stays experimental, scores need evidence, and active set locks settings', () => {
    const state = { mode: 'experimental-model', modelVersion: 'pilot-test', status: 'loaded-experimental', records: [{ assessed: true, predictions: [{ label: 'swinging', detected: true }] }],
      summary: { labelScope: ['swinging'], completed: 1, assessed: 1, score: null, reason: 'Need at least 3 assessed completed reps.' } };
    render(<ExperimentalModelPanel state={state} locked onLoad={vi.fn()} onModeChange={vi.fn()} />);
    expect(screen.getByLabelText(/Detector mode/).disabled).toBe(true);
    expect(screen.getByText(/Model pilot-test/)).toBeTruthy();
    expect(screen.getByText(/summary: Unavailable/)).toBeTruthy();
    expect(screen.getByText(/Review your upper-arm and torso/)).toBeTruthy();
  });
});
