const assert=require('node:assert/strict');
const F=require('../web/fair-rating.js');
const seed=1234567;let state=seed;
const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
const rows=[];
for(let session=0;session<16;session++){
  const base=Date.parse('2026-11-01T00:00:00Z')+session*24*3600000;
  for(let i=0;i<40;i++){
    const opp=1200+Math.floor(random()*450);
    const p=F.sigmoid(-.8*(opp-1400)/100);
    const y=random()<p;
    rows.push({key:'g-'+session+'-'+i,occurred_at:new Date(base+i*180000).toISOString(),
      character:'AKUMA',opponent_character:'RYU',mode:'ranked',phase:'unknown',
      own_control:'classic',mr_before:1400,opponent_mr_before:opp,
      outcome:y?'win':'loss'});
  }
}
const opts={character:'AKUMA',actAt:()=>14};
const report=F.analyze(rows,opts);
assert.equal(report.total,640);
assert.equal(report.acts[0].key,'act:14');
assert.equal(report.inferredN,640);
assert.equal(report.current.n,640);
assert.ok(report.current.crossing>1350&&report.current.crossing<1450);
assert.ok(report.current.model.b<0);
assert.equal(report.current.status,'exploratory');
assert.ok(report.current.interval.range[0]<report.current.crossing);
assert.ok(report.current.interval.range[1]>report.current.crossing);
assert.ok(report.current.interval.sessions>=16);
assert.ok(report.current.backtest.tested>=200);
assert.ok(report.current.backtest.folds>=4);
assert.equal(report.current.backtest.improved,true);
assert.ok(report.current.backtest.brier<report.current.backtest.baselineBrier);
assert.equal(report.current.bands.reduce((n,b)=>n+b.n,0),640);
assert.equal(report.shift.earlyN,320);
assert.equal(report.shift.lateN,320);
assert.ok(report.shift.difference!==null);
// Direct record ACT 14 must join the same bucket as inferred ACT 14.
const mixed14=rows.map((r,i)=>i<50?{...r,phase:'14'}:r);
const merged=F.analyze(mixed14,opts);
assert.equal(merged.acts.length,1);
assert.equal(merged.selectedAct,'act:14');
assert.equal(merged.selectedN,640);
assert.equal(merged.inferredN,590);
assert.equal(merged.retrospectiveN,0);
assert.equal(F.analyze(rows,{character:'AKUMA'}).unassignedN,640);
assert.equal(F.analyze(rows,{character:'AKUMA'}).acts.length,0);

const withOfficial=[...rows.slice(0,450),...rows.slice(450,470).map((r,i)=>({
  ...r,key:'official-'+i,phase:'15'}))];
const separated=F.analyze(withOfficial,opts);
assert.equal(separated.acts.length,2);
assert.equal(separated.selectedAct,'act:15');
assert.equal(separated.current.crossing,null);
const explicit=F.analyze(withOfficial,{...opts,selectedAct:'act:14'});
assert.equal(explicit.selectedN,450);
assert.notEqual(explicit.current.crossing,null);
// Exclude missing MR, non-ranked, dup keys, invalid dates, tied missing win/loss.
const corrupted=[...rows,{...rows[0]},{...rows[0],key:'invalid-1',opponent_mr_before:0},
 {...rows[0],key:'invalid-2',mr_before:0},
 {...rows[0],key:'invalid-3',mode:'casual'},
 {...rows[0],key:'invalid-4',outcome:'unknown'},
 {...rows[0],key:'invalid-5',occurred_at:'not-a-date'},
 {...rows[0],key:'terry',character:'TERRY',mr_before:0}];
assert.equal(F.clean(corrupted,opts).length,640);
assert.equal(F.analyze(corrupted,opts).total,640);
assert.equal(F.analyze(corrupted,{character:'TERRY',actAt:()=>14}).current.crossing,null);
// A non-decreasing win rate by opponent MR is NOT a meaningful "skill" crossing.
const opposite=rows.map(r=>({...r,outcome:r.opponent_mr_before>=1400?'win':'loss'}));
assert.equal(F.analyze(opposite,opts).current.crossing,null);
// Pure narrow-range sample must not extrapolate an MR crossing.
const narrow=rows.map(r=>({...r,opponent_mr_before:1399+(r.opponent_mr_before%5)}));
assert.equal(F.analyze(narrow,opts).current.crossing,null);
assert.equal(F.analyze(rows.slice(0,50),opts).current.crossing,null);
const bt=F.backtest(F.clean(rows,opts));assert.equal(bt.status,'ready');
assert.ok(bt.training+bt.tested<=640);
assert.ok(bt.training>=200);
const ci=F.interval(F.clean(rows,opts));
assert.deepEqual(ci.range,F.interval(F.clean(rows,opts)).range);
console.log('Equal-win MR: ACT separation, session bootstrap, leakage-free backtest and fail-closed modeling passed');
