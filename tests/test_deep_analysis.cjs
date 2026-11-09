const assert=require('node:assert/strict');
const A=require('../web/deep-analysis.js');
const base=Date.parse('2026-11-09T00:00:00Z');
const row=(i,outcome='win',extra={})=>({
 key:String(i),occurred_at:new Date(base+i*60000).toISOString(),
 mode:'ranked',character:'AKUMA',opponent_character:'KEN',
 own_control:'classic',opponent_control:'modern',phase:'unknown',
 mr_before:1400,opponent_mr_before:1410,outcome,...extra
});
// 1: no inferred streak across session gaps, ambiguous same-second timestamps, or unknown results.
let rows=[row(0,'loss'),row(1,'loss'),row(2,'win'),row(3,'loss'),
  row(4,'loss'),row(5,'loss'),row(6,'win'),row(7,'unknown'),
  row(8,'loss'),row(9,'win'),row(55,'win')];
let data=A.afterLosses(rows,45);
assert.equal(data.sessions,2);
assert.equal(data.firstMatches,2);
assert.equal(data.buckets[1].games,3);
assert.equal(data.buckets[2].games,2);
assert.equal(data.buckets[3].games,1);
assert.equal(data.unresolved,1);
data=A.afterLosses([...rows,row(3,'win',{key:'same-second'})]);
assert.equal(data.ambiguousSessions,1);
assert.equal(data.excludedAmbiguousMatches,11);
assert.equal(data.buckets.reduce((n,x)=>n+x.games,0),0);

// 2: mutually exclusive MR bands; 0/unknown ratings and non-ranked modes do not become "equal rank".
let mr=A.mrDifference([
 row(0,'win',{opponent_mr_before:1300}),
 row(1,'win',{opponent_mr_before:1301}),
 row(2,'win',{opponent_mr_before:1390}),
 row(3,'win',{opponent_mr_before:1410}),
 row(4,'win',{opponent_mr_before:1411}),
 row(5,'win',{opponent_mr_before:1499}),
 row(6,'win',{opponent_mr_before:1500}),
 row(7,'win',{opponent_mr_before:0}),
 row(8,'win',{mr_before:null}),
 row(9,'loss',{mode:'custom',opponent_mr_before:1450})
]);
assert.deepEqual(mr.buckets.map(x=>x.games),[1,1,2,2,1]);
assert.equal(mr.excluded,2);
assert.equal(mr.valid,7);

// 3: sessions reset at 45-minute and phase boundaries, positions 1-10, 11-20 etc.
rows=Array.from({length:35},(_,i)=>row(i,i%3===0?'loss':'win'));
rows.push(...Array.from({length:12},(_,i)=>row(90+i,'win',{key:'second-'+i})));
let pos=A.sessionPositions(rows,45);
assert.deepEqual(pos.buckets.map(x=>x.games),[20,17,10,5]);
assert.deepEqual(pos.buckets.map(x=>x.sessions),[2,2,1,1]);
pos=A.sessionPositions([row(0),row(1,'loss',{phase:'11'}),row(2,'win',{phase:'12'})]);
assert.equal(pos.sessions,3);
assert.equal(pos.buckets[0].games,3);

// 4: disjoint recent N and previous N, no invented comparison when insufficient.
rows=Array.from({length:120},(_,i)=>row(i,i<60?'loss':'win',
 {opponent_character:i<60?'KEN':'RYU'}));
let series=A.recentPerformance(rows);
assert.equal(series.windows[0].available,20);
assert.equal(series.windows[0].previousAvailable,20);
assert.equal(series.windows[0].comparisonsComplete,true);
assert.equal(series.windows[0].current.winRate,100);
assert.equal(series.windows[0].previous.winRate,100);
assert.equal(series.windows[1].current.winRate,100);
assert.equal(series.windows[1].previous.winRate,20);
assert.equal(series.windows[2].previous,null); // 120 < 2*100
assert.equal(series.windows[2].previousAvailable,20);
const tied=A.recentPerformance([...rows,row(119,'loss',{key:'tie'})]);
assert.equal(tied.ambiguousExcluded,2);
assert.equal(tied.total,119);
assert.equal(A.recentPerformance([row(0)]).windows[0].previous,null);
assert.equal(A.analyze([row(0),row(1,'loss',{mode:'custom'})]).ranked,1);

// Opponent-character change only when both windows have three or more actual games.
const shift=A.recentPerformance(Array.from({length:40},(_,i)=>
 row(i,i<20?'loss':'win',{opponent_character:'KEN'})));
assert.equal(shift.windows[0].matchupShift.length,1);
assert.equal(shift.windows[0].matchupShift[0].change,100);
console.log('Advanced loss-streak / opponent-MR / session-position / recent-trend tests passed');
