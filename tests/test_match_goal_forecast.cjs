const assert=require('node:assert/strict');
const F=require('../web/match-goal-forecast.js');
const now=Date.parse('2026-11-11T12:00:00+09:00');
const at=i=>new Date(now-(150-i)*3*60000).toISOString();
const matches=Array.from({length:120},(_,i)=>({
 key:'rank-'+i,mode:'ranked',character:'AKUMA',phase:'unknown',
 occurred_at:at(i),outcome:i%2===0?'win':'loss',mr_before:1300+i*2
}));
const observations=[{character:'AKUMA',phase:'unknown',observed_at:new Date(now-10*60000).toISOString(),mr:1450}];
const deltas=new Map(matches.map(m=>[m.key,{basis:'inferred',delta:2}]));
const options={rows:matches,observations,deltas,character:'AKUMA',
 phase:'all',now,actAt:()=>14,sessionRefs:new Map(),sessions:[]};
let a=F.analyze(options);
assert.equal(a.current,1450);
assert.equal(a.stale,false);
assert.equal(a.storedGames,120);
assert.deepEqual(a.cohort.map(x=>x.available),[20,50,100]);
assert.deepEqual(a.cohort.map(x=>x.known),[20,50,100]);
assert.equal(a.cohort[0].average,2);
assert.equal(a.cohort[0].winRate,50);
assert.deepEqual(a.cohort.map(x=>x.targets[0].required),[25,25,25]);
assert.deepEqual(a.cohort.map(x=>x.targets[1].required),[75,75,75]);
assert.equal(a.cohort[0].targets[0].label,'約25試合');
assert.equal(F.renderCount(0),'達成済み');
// 14/20 valid is still eligible, 13/20 is insufficient.
let partial=new Map(deltas);
for(let i=100;i<106;i++)partial.delete('rank-'+i);
a=F.analyze({...options,deltas:partial});
assert.equal(a.cohort[0].known,14);
assert.equal(a.cohort[0].status,'ready');
partial.delete('rank-106');
a=F.analyze({...options,deltas:partial});
assert.equal(a.cohort[0].known,13);
assert.equal(a.cohort[0].status,'low_coverage');
assert.equal(a.cohort[0].targets[0].required,null);
const few=F.analyze({...options,rows:matches.slice(-18)});
assert.equal(few.cohort[0].status,'insufficient_matches');
assert.equal(few.cohort[0].targets[0].required,null);
const negative=new Map(matches.map(m=>[m.key,{basis:'inferred',delta:-1}]));
const down=F.analyze({...options,deltas:negative});
assert.equal(down.cohort[0].status,'no_positive_growth');
assert.equal(down.cohort[0].targets[0].label,'増加傾向なし');
assert.equal(down.cohort[0].targets[0].required,null);
const stale=F.analyze({...options,now:now+4*60*60*1000});
assert.equal(stale.stale,true);
assert.equal(stale.cohort[0].targets[0].label,'MR更新待ち');
const achieved=F.analyze({...options,observations:[{...observations[0],mr:1610}]});
assert.equal(achieved.cohort[0].targets[0].required,0);
assert.equal(achieved.cohort[0].targets[1].label,'達成済み');
const noMR=F.analyze({...options,observations:[]});
assert.equal(noMR.current,null);
assert.equal(noMR.cohort[0].targets[0].label,'現在MR不明');
const onlyCharacter=F.analyze({...options,character:'RYU'});
assert.equal(onlyCharacter.storedGames,0);
const actChange=F.analyze({...options,actAt:time=>Date.parse(time)>Date.parse(at(110))?15:14});
assert.ok(actChange.storedGames<20); // only recent same-Act matches
assert.equal(actChange.cohort[0].status,'insufficient_matches');
// Check no mixing between exact phase labels.
const differentPhase=F.analyze({...options,rows:[...matches,{...matches[0],key:'other',phase:'phase15',occurred_at:new Date(now-15000).toISOString()}]});
assert.equal(differentPhase.storedGames,120);
// Independent audit must not fill in the missing game deltas.
const auditSession={key:'rank-119',characters:['AKUMA'],phase:'unknown',start:at(115),end:at(119),games:5};
const sessionRefs=new Map([['rank-119',{mr:15,snapshots:2,status:'snapshot_matched'}]]);
const audited=F.analyze({...options,sessions:[auditSession],sessionRefs});
assert.equal(audited.audit.snapshotMatched,1);
assert.equal(audited.audit.sessions[0].sumEstimated,10);
assert.equal(audited.audit.sessions[0].residual,5);
assert.equal(audited.audit.fullyExplained,0);
assert.equal(audited.cohort[0].average,2);
const huge=F.analyze({...options,deltas:new Map(matches.map(m=>[m.key,{basis:'inferred',delta:0.0001}]))});
assert.equal(huge.cohort[0].targets[0].label,'1万試合超（範囲外）');
console.log('Required match-count goals 20/50/100: coverage, stale data, falling rate, Act boundaries, session audit passed');
