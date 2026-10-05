// Independent synthetic analytics transport/date/units checks. No network.
import test from 'node:test';
import assert from 'node:assert/strict';
import {getAnalytics,degrees,seconds,percent,dateTime,localDate,validTimezone} from '../src/api/analytics.js';
import {listWorkouts} from '../src/api/workouts.js';
test('analytics sends owned bounded date/timezone query and preserves null response data',async(t)=>{
  const original=globalThis.fetch;const calls=[];globalThis.fetch=async(url,init)=>{calls.push({url,init});return new Response(JSON.stringify({totals:{averageRomDeg:null}}),{status:200,headers:{'Content-Type':'application/json'}});};t.after(()=>{globalThis.fetch=original;});
  const result=await getAnalytics({startDate:'2025-03-09',endDate:'2025-03-09',timezone:'America/New_York'},'owner-token');
  const parsed=new URL(calls[0].url,'http://localhost');assert.equal(parsed.pathname,'/api/analytics/me');assert.equal(parsed.searchParams.get('timezone'),'America/New_York');assert.equal(calls[0].init.headers.Authorization,'Bearer owner-token');assert.equal(result.totals.averageRomDeg,null);assert.ok(!calls[0].url.includes('owner-token'));
  await listWorkouts({limit:2,cursor:'opaque+/?'},'owner-token');assert.equal(new URL(calls[1].url,'http://localhost').searchParams.get('cursor'),'opaque+/?');
});
test('null/invalid measurements remain unavailable while genuine zero retains units',()=>{
  for(const fn of [degrees,seconds,percent])for(const value of [null,undefined,NaN,'0'])assert.equal(fn(value),'Not assessed');
  assert.equal(degrees(0),'0.0°');assert.equal(seconds(0),'0.0 s');assert.equal(percent(0),'0.0%');
});
test('local dates handle UTC boundary and both DST repeated hours',()=>{
  assert.equal(localDate(new Date('2025-10-01T00:30:00Z'),'America/New_York'),'2025-09-30');
  for(const value of ['2025-11-02T05:30:00Z','2025-11-02T06:30:00Z'])assert.equal(localDate(new Date(value),'America/New_York'),'2025-11-02');
  assert.equal(validTimezone('Mars/Base'),false);assert.equal(validTimezone('America/New_York'),true);assert.equal(dateTime(null,'UTC'),'Not assessed');assert.equal(dateTime('bad','UTC'),'Not assessed');
});
