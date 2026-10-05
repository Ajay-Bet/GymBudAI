// Independent synthetic Sprint 6 contract rendering; jsdom evidence only.
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
const mocks = vi.hoisted(() => ({ getAnalytics: vi.fn(), auth: {status:'signed-in',token:'s6-token'} }));
vi.mock('../../src/auth/AuthContext', () => ({useAuth: () => mocks.auth}));
vi.mock('../../src/api/analytics', async (original) => ({...(await original()),getAnalytics: (...args) => mocks.getAnalytics(...args)}));
import ProgressPage from '../../src/pages/ProgressPage.jsx';
const metric = (extra = {}) => ({workouts:1,sets:1,completedReps:3,analyzedReps:2,issueBearingReps:1,noIssueReps:1,noIssueFraction:.5,
  assessedIssueEpisodes:3,unassessedIssueEpisodes:1,episodeCountsByType:{'torso-swing':1,'upper-arm-drift':2},averageRomDeg:20,romObservedReps:2,
  medianDurationMs:2000,durationObservedReps:3,trackingAssessableMs:500,trackingSessionMs:1000,trackingCoverage:.5,coverageKnownSets:1,coverageComplete:true,...extra});
const config = {exerciseId:'dumbbell-curl',side:'left',view:'side',supportedView:true,analyzerVersion:'curl-1',featureVersion:'1.2',rulesVersion:'rules-1',summarySchemaVersion:'set-summary-1',mode:'review',assessedRuleTypes:['torso-swing'],minFormCoverage:.8};
const point = (id,day,extra) => ({workoutId:id,startedAt:`2025-10-${day}T12:00:00Z`,localDate:`2025-10-${day}`,metrics:metric(extra)});
const group = (extra = {}) => ({id:'group-1',configuration:config,comparisonEligible:true,metrics:metric({workouts:2}),points:[point('old','01',{averageRomDeg:10,analyzedReps:4,issueBearingReps:1}),point('new','02',{averageRomDeg:20,analyzedReps:4,issueBearingReps:2})],...extra});
const result = (groups = [group()],totals = metric()) => ({range:{startDate:'2025-10-01',endDate:'2025-10-31',timezone:'UTC'},totals,groups,excluded:{openWorkouts:1,emptyWorkouts:2}});
const show = () => render(<MemoryRouter><ProgressPage /></MemoryRouter>);
beforeEach(() => {localStorage.clear();localStorage.setItem('gymbud.analytics.timezone','UTC');mocks.getAnalytics.mockReset();mocks.auth={status:'signed-in',token:'s6-token'};});
afterEach(cleanup);
it('shows units, denominators, accessible tables and percentage-point changes',async () => {
  mocks.getAnalytics.mockResolvedValue(result());show();await screen.findByRole('heading',{name:'Selected period'});
  expect(screen.getByRole('img',{name:/Average ROM.*2 measured workouts/})).toBeTruthy();
  expect(screen.getByRole('img',{name:/Issue-bearing rep frequency.*2 measured workouts/})).toBeTruthy();
  expect(screen.getByText(/Workout measurements — text equivalent/)).toBeTruthy();
  for(const value of ['2 of 3 completed reps','1 of 2 analyzed reps','20.0°','2.0 s','3 episodes','Detector summary, not a validated form score','+10.0°','+25.0 percentage points','Observed change only','1 open workouts and 2 finished workouts'])expect(document.body.textContent).toContain(value);
  expect(mocks.getAnalytics).toHaveBeenCalledWith(expect.objectContaining({timezone:'UTC'}),'s6-token',expect.objectContaining({signal:expect.anything()}));
  expect(screen.getAllByRole('link').some(a=>a.getAttribute('href')==='/history/old')).toBe(true);
});
it('keeps missing data unavailable, partial tracking explicit and charts insufficient',async () => {
  const absent={averageRomDeg:null,romObservedReps:0,analyzedReps:0,issueBearingReps:0,noIssueFraction:null,medianDurationMs:null,durationObservedReps:0,trackingCoverage:null,trackingAssessableMs:null,trackingSessionMs:null,coverageKnownSets:0,coverageComplete:false};
  mocks.getAnalytics.mockResolvedValue(result([group({points:[point('old','01',absent),point('new','02',{})],metrics:metric(absent)})],metric(absent)));show();await screen.findByRole('heading',{name:'Selected period'});
  expect(screen.getAllByText(/Not assessed/).length).toBeGreaterThan(0);expect(screen.getAllByText(/Insufficient data/)).toHaveLength(2);
  expect(document.body.textContent).toContain('Partial coverage data');expect(screen.queryByRole('img',{name:/measured workouts/})).toBeNull();expect(document.body.textContent).not.toMatch(/NaN|undefined|null/);
});
it('separates configurations and withholds unsupported-view comparisons',async () => {
  mocks.getAnalytics.mockResolvedValue(result([group(),group({id:'front',comparisonEligible:false,configuration:{...config,view:'front',supportedView:false,rulesVersion:'rules-2'}})]));show();await screen.findByRole('note');
  expect(screen.getByRole('note').textContent).toMatch(/Configuration differences.*No trend crosses/);expect(screen.getByText(/Unsupported camera view: saved measurements/)).toBeTruthy();expect(screen.getAllByText(/Insufficient data/)).toHaveLength(2);
});
it('explains empty periods',async () => {
  mocks.getAnalytics.mockResolvedValue(result([],metric({workouts:0,sets:0,completedReps:0,averageRomDeg:null,noIssueFraction:null})));show();await screen.findByText(/No finished workouts with saved sets in this date range/);expect(screen.queryByRole('img',{name:/measured workouts/})).toBeNull();
});
it('retries errors and aborts pending work at teardown',async () => {
  mocks.getAnalytics.mockRejectedValueOnce(new Error('database unavailable')).mockResolvedValueOnce(result([]));const view=show();await screen.findByRole('alert');fireEvent.click(screen.getByRole('button',{name:'Retry'}));await screen.findByRole('heading',{name:'Selected period'});
  const signal=mocks.getAnalytics.mock.calls.at(-1)[2].signal;view.unmount();expect(signal.aborted).toBe(true);
});
it('never fetches signed-out data',async () => {
  mocks.auth={status:'signed-out',token:null};show();expect(await screen.findByRole('link',{name:'Sign in'})).toBeTruthy();expect(mocks.getAnalytics).not.toHaveBeenCalled();
});
it('distinguishes absent rule config from none and identifies experimental review mode',async () => {
  mocks.getAnalytics.mockResolvedValue(result([group({configuration:{...config,assessedRuleTypes:null},comparisonEligible:false})]));show();await screen.findByRole('heading',{name:'Selected period'});
  expect(document.body.textContent).toContain('Not assessed / configuration unavailable');expect(document.body.textContent).toContain('Experimental detector output');
});
it('invalid timezone never fetches and a valid changed range uses a new request',async()=>{
  mocks.getAnalytics.mockResolvedValue(result());show();await screen.findByRole('heading',{name:'Selected period'});
  fireEvent.change(screen.getByLabelText('Display timezone'),{target:{value:'Mars/Base'}});fireEvent.click(screen.getByRole('button',{name:'Apply date range'}));await screen.findByRole('alert');expect(mocks.getAnalytics).toHaveBeenCalledTimes(1);
  fireEvent.change(screen.getByLabelText('Display timezone'),{target:{value:'America/New_York'}});fireEvent.click(screen.getByRole('button',{name:'Apply date range'}));await screen.findByRole('heading',{name:'Selected period'});expect(mocks.getAnalytics).toHaveBeenCalledTimes(2);expect(mocks.getAnalytics.mock.calls[1][0].timezone).toBe('America/New_York');
});
