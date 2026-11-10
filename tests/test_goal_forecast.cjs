const assert=require('node:assert/strict');
const F=require('../web/goal-forecast.js');
const H=3600000,now=Date.parse('2026-11-11T02:00:00+09:00');
const latest={observed_at:new Date(now-10*60000).toISOString(),mr:1450};
const end=now-60*60000;
const bar={start:end-24*H,end,delta:106,rate:106/24,
 observedStart:new Date(end-24*H).toISOString(),observedEnd:new Date(end).toISOString()};
const long={available:true,slope:0.9,count:70,spanHours:72,endStamp:Date.parse(latest.observed_at)};
let f=F.analyze({latest,lastBar:bar,regression:long,now});
assert.equal(f.stale,false);
assert.equal(f.current,1450);
assert.equal(f.targets[0].remaining,50);
assert.ok(Math.abs(f.targets[0].shortHours-50*24/106)<1e-9);
assert.equal(f.targets[0].shortLabel,'約11.3時間');
assert.equal(f.targets[0].longLabel,'約2日8時間');
assert.equal(f.targets[1].shortLabel,'約1日10時間');
assert.equal(f.targets[1].longLabel,'約6日23時間');
assert.equal(F.timeLabel(24),'約1日0時間');
assert.equal(F.timeLabel(0),'達成済み');
assert.equal(F.timeLabel(null),'算定不可');
assert.equal(F.timeLabel(9000),'1年以上（算定対象外）');
const achieved=F.analyze({latest:{...latest,mr:1650},lastBar:{...bar,rate:-1,delta:-24},
 regression:{...long,slope:-1},now});
assert.equal(achieved.targets[0].shortLabel,'達成済み');
assert.equal(achieved.targets[1].shortLabel,'達成済み');
const falling=F.analyze({latest,lastBar:{...bar,rate:-3,delta:-72},
 regression:{...long,slope:-1},now});
assert.equal(falling.targets[0].shortLabel,'算定不可');
assert.equal(falling.targets[1].longLabel,'算定不可');
const flat=F.analyze({latest,lastBar:{...bar,rate:0,delta:0},
 regression:{...long,slope:0},now});
assert.equal(flat.targets[0].shortHours,null);
assert.equal(flat.targets[0].longHours,null);
const stale=F.analyze({latest:{...latest,observed_at:new Date(now-4*H).toISOString()},lastBar:bar,regression:long,now});
assert.equal(stale.stale,true);
assert.equal(stale.targets[0].shortHours,null);
const noRecent24=F.analyze({latest,lastBar:{...bar,delta:null,rate:null},regression:long,now});
assert.equal(noRecent24.shortRate,null);
assert.equal(noRecent24.targets[0].shortLabel,'算定不可');
const oldWindow=F.analyze({latest,lastBar:{...bar,end:end-3*H},regression:long,now});
assert.equal(oldWindow.shortRate,null);
const shortReg=F.analyze({latest,lastBar:bar,regression:{...long,count:11},now});
assert.equal(shortReg.longRate,null);
const shortPeriod=F.analyze({latest,lastBar:bar,regression:{...long,spanHours:47.5},now});
assert.equal(shortPeriod.longRate,null);
const missing=F.analyze({latest:null,lastBar:null,regression:null,now});
assert.equal(missing.targets[0].shortLabel,'算定不可');
assert.equal(missing.current,null);
assert.equal(missing.stale,true);
// Rolling 24h reference uses actual captured points, not an interpolated missing value.
const at=Date.parse(latest.observed_at);
const sample=[
  {mr:1377,phase:'unknown',character:'AKUMA',observed_at:new Date(at-24*H+3*60000).toISOString()},
  {mr:1380,phase:'unknown',character:'AKUMA',observed_at:new Date(at-24*H+26*60000).toISOString()},
  {mr:1450,phase:'unknown',character:'AKUMA',observed_at:latest.observed_at}
];
const rolling=F.rolling24h(sample);
assert.equal(rolling.delta,73);
assert.equal(rolling.observedStart,sample[0].observed_at);
assert.ok(rolling.rate>3&&rolling.rate<3.1);
assert.equal(rolling.end,at);
assert.equal(F.rolling24h([sample[0]]),null);
assert.equal(F.rolling24h([sample[0],sample[2]],1),null);
assert.equal(F.rolling24h([sample[0],{...sample[2],phase:'2'}]),null);
assert.equal(F.rolling24h([{...sample[0],mr:null},sample[2]]),null);
const outOfDate=F.analyze({latest,lastBar:rolling,regression:long,now});
assert.ok(outOfDate.targets[0].shortHours>16);
console.log('Goal MR forecasts: conditional ETA, negative or missing rate, stale and achieved tests passed');
