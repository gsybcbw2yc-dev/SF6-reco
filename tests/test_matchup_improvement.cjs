const assert=require('node:assert/strict'),M=require('../web/matchup-improvement.js');
const rows=[],deltas=new Map();
for(let i=0;i<100;i++){
  const opponent=i<20?'ZANGIEF':'RYU',y=i<20?Number(i<6):Number(i%2===0),key=String(i);
  rows.push({key,opponent,y});deltas.set(key,{basis:'inferred',delta:y?8:-8});
}
const data=M.analyze(rows,deltas),r=M.simulate(data,'ZANGIEF',.5,100);
assert.equal(r.source,'matchup');assert.equal(r.n,20);assert.equal(r.encounters,20);
assert.equal(r.currentRate,.3);assert.equal(r.gain,64);assert.ok(Math.abs(r.baseline+64)<1e-9);assert.equal(r.improved,0);
assert.equal(M.simulate(data,'ZANGIEF',.5,200).gain,128);
assert.ok(M.simulate(data,'ZANGIEF',.1,100).gain<0);
assert.equal(M.simulate(data,'ZANGIEF',1.5,100),null);
for(let i=0;i<6;i++)deltas.delete(String(i));
assert.equal(M.simulate(M.analyze(rows,deltas),'ZANGIEF',.5,100).source,'pooled');
assert.equal(M.simulate(M.analyze(rows,new Map()),'ZANGIEF',.5,100).gain,null);
assert.equal(M.simulate(M.analyze(rows.slice(0,8),deltas),'ZANGIEF',.5,100).gain,null);
assert.equal(M.simulate(data,'NOT_A_CHARACTER',.5,100),null);
console.log('Matchup improvement: exact formula, scoped payouts, coverage, sparse cases passed');
