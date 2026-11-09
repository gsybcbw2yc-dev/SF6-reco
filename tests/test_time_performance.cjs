const assert=require('node:assert/strict');
const A=require('../web/time-performance.js');
const JST='2026-11-09T';
function row(time,outcome='win',extra={}){
 return {occurred_at:time,mode:'ranked',character:'AKUMA',own_control:'classic',
   opponent_control:'modern',outcome,...extra};
}
const sample=[
 row('2026-11-08T15:15:00Z'), // JST 00:15 Nov 9
 row('2026-11-08T15:45:00Z','loss'),
 row('2026-11-08T16:00:00Z','draw'), // JST 01:00
 row('2026-11-09T03:00:00Z','unknown'), // JST 12:00
 row('2026-11-09T04:00:00Z','loss'), // JST 13:00
 row('not-a-date','win'),
];
let result=A.analyze(sample,4);
assert.equal(result.slots.length,6);
assert.equal(result.total.games,5);
assert.equal(result.undated,1);
assert.equal(result.slots[0].games,3);
assert.equal(result.slots[0].wins,1);
assert.equal(result.slots[0].losses,1);
assert.equal(result.slots[0].draws,1);
assert.equal(Math.round(result.slots[0].winRate*10)/10,33.3);
assert.equal(result.slots[3].games,2);
assert.equal(result.slots[3].winRate,0);
assert.equal(result.slots[2].winRate,null);
assert.equal(result.slots[0].playDays,1);
assert.equal(result.weekdays[1].games,5);
assert.equal(A.analyze(sample,1).slots.length,24);
assert.equal(A.analyze(sample,2).slots.length,12);
assert.equal(A.analyze(sample,2).slots[0].games,3);
assert.equal(A.parts('2026-11-08T15:00:00Z').hour,0);
assert.equal(A.parts('2026-11-08T14:59:59Z').hour,23);
assert.throws(()=>A.analyze(sample,3),RangeError);
const enough=[];
for(let day=1;day<=5;day++)for(let i=0;i<6;i++)
 enough.push(row(`2026-11-0${day}T15:${String(i).padStart(2,'0')}:00Z`));
assert.equal(A.analyze(enough,1).slots[0].enough,true);
assert.equal(A.analyze(enough.slice(0,24),1).slots[0].enough,false);
const opts={days:'7',mode:'ranked',character:'AKUMA',ownControl:'classic',opponentControl:'modern'};
const now=Date.parse('2026-11-09T15:00:00Z');
const before=row('2026-11-01T15:00:00Z','loss');
const current=row('2026-11-08T15:00:00Z','win');
const other=row('2026-11-08T15:00:00Z','loss',{mode:'custom'});
const prev=A.previousPeriod([before,current,other],opts,4,now);
assert.equal(prev.recent.total.games,1);
assert.equal(prev.prior.total.games,1);
assert.equal(prev.recent.total.winRate,100);
assert.equal(prev.prior.total.winRate,0);
assert.equal(A.previousPeriod([current],{...opts,days:'all'},4,now),null);
console.log('Time-of-day and weekday analysis tests passed');
