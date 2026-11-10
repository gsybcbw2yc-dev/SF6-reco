const assert=require('node:assert/strict');
const T=require('../web/chart-trends.js');
const H=3600000,zero=Date.parse('2026-11-10T00:00:00Z');
function row(i,mr,changes={}){
 return {observed_at:new Date(zero+i*H).toISOString(),character:'AKUMA',
 phase:'unknown',mr,lp:100000+mr,...changes};
}
const exact=[row(0,10),row(1,12),row(2,14),row(3,16),row(4,18),row(5,20)];
const linear=T.regression(exact,'mr');
assert.equal(linear.available,true);
assert.ok(Math.abs(linear.slope-2)<1e-12);
assert.ok(Math.abs(linear.startValue-10)<1e-12);
assert.ok(Math.abs(linear.endValue-20)<1e-12);
assert.equal(linear.count,6);
assert.ok(Math.abs(T.regression([...exact].reverse(),'mr').slope-2)<1e-12);
const averages=T.movingAverage(exact,'mr',5);
assert.equal(averages.length,1);
assert.deepEqual(averages[0].map(x=>x.value),[12,13,14,16]); // trailing 3,4,5,5 points
const flat=[row(0,50),row(.5,50),row(1,50),row(1.5,50)];
assert.equal(T.regression(flat,'mr').slope,0);
assert.ok(T.movingAverage(flat,'mr').every(x=>x.every(y=>y.value===50)));
assert.equal(T.regression(exact.slice(0,2),'mr').available,false);
assert.equal(T.regression([row(0,10),row(0,20),row(0,30)],'mr').available,false);
assert.equal(T.regression([row(0,10),row(.1,20),row(.2,30)],'mr').available,false);
const mixedPhase=[...exact.slice(0,4),row(4,18,{phase:'phase2'})];
assert.equal(T.regression(mixedPhase,'mr').available,false);
assert.deepEqual(T.movingAverage(mixedPhase,'mr').map(g=>g.length),[2]); // first group 4 obs, second 1
const gapped=[row(0,10),row(.5,12),row(1,14),row(4,16),row(4.5,18),row(5,20),row(5.5,22)];
assert.deepEqual(T.movingAverage(gapped,'mr').map(g=>g.length),[1,2]);
assert.ok(Math.abs(T.regression(gapped,'mr').slope-((gapped[6].mr-gapped[0].mr)/5.5))>1e-8); // OLS by real time
assert.deepEqual(T.movingAverage(exact.filter(p=>p.mr<18),'mr').map(g=>g.length),[2]);
assert.equal(T.regression([row(0,10),row(1,null),row(2,14),row(3,16)],'mr').count,3);
assert.equal(T.regression([row(0,10),row(1,NaN),row(2,14),row(3,16)],'mr').count,3);
assert.equal(T.regression([row(0,10),row(1,12,{observed_at:'invalid'}),row(2,14)],'mr').available,false);
const mixedCharacter=[...exact.slice(0,4),row(4,18,{character:'KEN'})];
assert.equal(T.regression(mixedCharacter,'mr').available,false);
assert.equal(T.regression(exact,'lp').available,true);
assert.equal(T.regression(exact,'lp').slope,2);
console.log('Chart trends: OLS slope, genuine observation timing, gap-aware MA5, phase/missing data passed');
