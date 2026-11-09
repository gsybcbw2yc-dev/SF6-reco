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

const p = (time, mr, phase = '1') => ({ character: 'AKUMA', mr, phase, observed_at: `2026-11-08T${time}Z` });
const opts = { character: 'AKUMA', minutes: 60, range: 'all', now };
let a = analyze([p('05:00:40', 100), p('05:02:00', 10000), p('06:00:35', 90)], opts);
assert.equal(a.bars.find(b => b.start === start).delta, -10); // no short-interval MR/h spike
assert.equal(a.bars.find(b => b.start === start).rate, -10);
a = analyze([p('05:00:40', 100), p('06:00:35', 90, '2')], opts);
assert.equal(a.bars.length, 0); // phase boundary removes incompatible segment
a = analyze([p('05:00:40', 100), p('06:00:35', 90, '2')], { ...opts, phase: '1' });
assert.equal(a.bars.length, 0);
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
console.log('Fixed-window MR analysis passed; 14:00–15:00 JST = -55 MR');
