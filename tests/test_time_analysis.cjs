const assert = require('node:assert/strict');
const fs = require('node:fs');
const { analyze } = require('../web/time-analysis.js');
const actual = JSON.parse(fs.readFileSync('web/data/history.json', 'utf8')).observations;
const now = Date.parse('2026-11-09T23:00:00Z');
const real = analyze(actual, { character: 'AKUMA', minutes: 60, range: 'all', now });
const start = Date.parse('2026-11-08T05:00:00Z'); // 14:00 JST
const check = real.bars.find(b => b.start === start);
assert.equal(check.delta, -55);
assert.equal(check.rate, -55);
assert.equal(check.observedStart, '2026-11-08T05:00:44Z');
assert.equal(check.observedEnd, '2026-11-08T06:00:44Z');

const terryObs=[{character:'TERRY',mr:0,lp:22617,phase:'unknown',
 observed_at:'2026-11-08T05:00:40Z'},
 {character:'TERRY',mr:0,lp:22800,phase:'unknown',
 observed_at:'2026-11-08T06:00:35Z'}];
const terryMR=analyze(terryObs,{character:'TERRY',minutes:60,range:'all',now});
assert.equal(terryMR.segment.length,0);
assert.equal(terryMR.bars.length,0);
const p = (time, mr, phase = '1') => ({ character: 'AKUMA', mr, phase, observed_at: `2026-11-08T${time}Z` });
const opts = { character: 'AKUMA', minutes: 60, range: 'all', now };
let a = analyze([p('05:00:40', 100), p('05:02:00', 10000), p('06:00:35', 90)], opts);
assert.equal(a.bars.find(b => b.start === start).delta, -10); // no short-interval MR/h spike
assert.equal(a.bars.find(b => b.start === start).rate, -10);
a = analyze([p('05:00:40', 100), p('06:00:35', 90, '2')], opts);
assert.equal(a.bars.length, 0); // phase boundary removes incompatible segment
a = analyze([p('05:00:40', 100), p('06:00:35', 90, '2')], { ...opts, phase: '1' });
assert.equal(a.bars.length, 0);
a = analyze([p('05:00:40', 100), p('06:00:35', 90, '2'), p('07:00:30', 80, '1')], { ...opts, phase: '1' });
assert.equal(a.segment.length, 1); // same label after a different phase is a new segment
a = analyze([p('05:00:40', 100), p('07:00:35', 80)], opts);
assert.equal(a.bars[0].delta, null); // no artificial 06:00 observation
a = analyze([p('05:10:00', 100), p('06:00:35', 90)], opts);
assert.equal(a.bars.length, 0); // outside five-minute boundary tolerance
a = analyze([p('05:00:40', 100), p('06:00:35', 90), p('07:00:30', 120), p('08:00:25', 80)], opts);
assert.deepEqual(a.validBars.map(b => b.delta), [-10, 30, -40]);
assert.equal(a.maxRise, 30); assert.equal(a.maxFall, -40);
assert.equal(a.averageRate, -20 / 3);
assert.equal(a.peak, 120); assert.equal(a.current, 80);
assert.equal(a.belowPeak, 40); assert.equal(a.toNewHigh, 41);
assert.equal(a.maxDrawdown, 40); assert.equal(a.recordCount, 1);
assert.equal(a.highRecords.at(-1).observed_at, '2026-11-08T07:00:30Z');
assert.equal(analyze([], opts).averageRate, null);
assert.throws(() => analyze([], { ...opts, minutes: 1 }), RangeError);
for (const [minutes, delta] of [[30, 5], [60, 10], [180, 30], [1440, 240]]) {
  const first = Date.parse('2026-11-08T15:00:00Z'); // 00:00 JST
  const observations = [
    { character: 'AKUMA', phase: '1', mr: 1500, observed_at: new Date(first + 40_000).toISOString() },
    { character: 'AKUMA', phase: '1', mr: 1500 + delta, observed_at: new Date(first + minutes * 60_000 + 45_000).toISOString() },
  ];
  const result = analyze(observations, { ...opts, minutes });
  assert.equal(result.validBars.length, 1, `${minutes} minute window`);
  assert.equal(result.validBars[0].delta, delta);
  assert.equal(result.validBars[0].rate, 10);
}
const heartbeat = analyze([p('05:00:40', 1500), p('06:00:35', 1500)], opts);
assert.equal(heartbeat.validBars[0].delta, 0);
console.log('Fixed-window MR analysis passed; 14:00–15:00 JST = -55 MR');
