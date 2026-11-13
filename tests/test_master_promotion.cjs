const assert=require('node:assert/strict');
const P=require('../web/master-promotion-forecast.js');
const now=Date.parse('2026-11-13T19:25:00+09:00');
const at=i=>new Date(now-(130-i)*3*60000).toISOString();
let lp=19500;
const rows=Array.from({length:120},(_,i)=>{
  const r={key:'terry-'+i,occurred_at:at(i),character:'TERRY',
    phase:'unknown',mode:'ranked',lp_before:lp,mr_before:0,
    outcome:i%4===0?'loss':'win'};
  lp+=r.outcome==='win'?60:-40;
  return r;
});
const recent=rows.at(-1);
const snapshot={character:'TERRY',phase:'unknown',mr:0,lp:22952,
  observed_at:new Date(now-10*60000).toISOString()};
const observations=[snapshot];
const opts={rows,observations,character:'TERRY',now,actAt:()=>14};
let x=P.analyze(opts);
assert.equal(x.mode,'lp');
assert.equal(x.target,25000);
assert.equal(x.currentLP,22952);
assert.equal(x.remaining,2048);
assert.equal(x.rank,'ダイヤモンド ★4');
assert.equal(x.stale,false);
assert.deepEqual(x.cohorts.map(o=>o.totalMatches),[20,50,100]);
assert.deepEqual(x.cohorts.map(o=>o.known),[19,49,99]);
assert.equal(x.cohorts[0].average>0,true);
assert.equal(x.cohorts[0].required,Math.ceil(2048/x.cohorts[0].average));
assert.match(x.cohorts[0].label,/試合/);
assert.equal(P.rankLabel(23800),'ダイヤモンド ★5');
assert.equal(P.rankLabel(25000),'マスター');
assert.equal(P.rankLabel(13000),'プラチナ ★1');
assert.equal(P.rankLabel(null),'LP未取得');
assert.equal(P.rankLabel(0),'ルーキー ★1');
assert.equal(P.latestStatus([{...snapshot,lp:0}],'TERRY').currentLP,0);
// Do not assume Master just because a collector uses MR:0; do when MR>0 or LP>=25000.
assert.equal(P.latestStatus([{...snapshot,lp:25000}], 'TERRY').mode,'mr');
assert.equal(P.latestStatus([{...snapshot,mr:1350}], 'TERRY').mode,'mr');
assert.equal(P.latestStatus([{...snapshot,lp:25000},{...snapshot,
 lp:24000,observed_at:new Date(now).toISOString()}],'TERRY').mode,'mr'); // no demotion
assert.equal(P.latestStatus([{...snapshot,mr:0}], 'TERRY').mode,'lp');
const achieved=P.analyze({...opts,observations:[{...snapshot,lp:25000}]});
assert.equal(achieved.mode,'mr');
assert.equal(achieved.remaining,0);
// Exact 20/50/100 windows, not all collected matches or a 20-game partial prediction.
const small=P.analyze({...opts,rows:rows.slice(-17)});
assert.equal(small.cohorts[0].label,'データ不足');
const none=P.analyze({...opts,observations:[]});
assert.equal(none.currentLP,null);
assert.equal(none.cohorts[0].label,'LP未取得');
const stale=P.analyze({...opts,now:now+4*3600000});
assert.equal(stale.stale,true);
assert.equal(stale.cohorts[0].label,'LP更新待ち');
const lowCoverage=rows.map((r,i)=>i>=110?{...r,lp_before:null}:r);
const bad=P.analyze({...opts,rows:lowCoverage});
assert.equal(bad.cohorts[0].known<14,true);
assert.equal(bad.cohorts[0].label,'データ不足');
const badAct=P.analyze({...opts,actAt:time=>Date.parse(time)>=Date.parse(at(113))?15:14});
assert.equal(badAct.storedGames<20,true);
assert.equal(badAct.cohorts[0].label,'データ不足');
// No inferred LP across modes/characters/large gaps/wrong sign.
const pair=(outcome,delta,extra={})=>[
 {key:'A',occurred_at:at(0),character:'TERRY',phase:'unknown',
 mode:'ranked',outcome,lp_before:22000},
 {key:'B',occurred_at:at(1),character:'TERRY',phase:'unknown',
 mode:'ranked',outcome:'loss',lp_before:22000+delta,...extra}
];
assert.equal(P.inferLP(pair('win',55)).get('A').delta,55);
assert.equal(P.inferLP(pair('win',50).map(x=>({...x,lp_before:x.key==='A'?0:50}))).get('A').delta,50);
assert.equal(P.inferLP(pair('loss',-40)).get('A').delta,-40);
assert.equal(P.inferLP(pair('loss',0)).get('A').delta,0); // Rookie or rank-protection loss can cost no LP
assert.equal(P.inferLP(pair('win',-40)).get('A').delta,null);
assert.equal(P.inferLP(pair('win',55,{mode:'custom'})).get('A').delta,null);
assert.equal(P.inferLP(pair('win',55,{character:'AKUMA'})).get('A').delta,null);
assert.equal(P.inferLP(pair('win',2100)).get('A').delta,null);
assert.equal(P.inferLP(pair('win',55,{occurred_at:at(5)})).get('A').delta,null);
assert.equal(P.inferLP(pair('win',55,{phase:'15'})).get('A').delta,null);
assert.equal(P.inferLP(pair('win',55,{lp_before:null})).get('A').delta,null);
assert.equal(P.inferLP(pair('win',55,{occurred_at:at(0)})).get('A').delta,null);
const changedAct=P.inferLP(pair('win',55),time=>time===at(0)?14:15);
assert.equal(changedAct.get('A').delta,null);
const negative=rows.map((r,i)=>({...r,outcome:'loss',lp_before:24000-i*40}));
const negativeResults=P.analyze({...opts,rows:negative});
assert.equal(negativeResults.cohorts[0].label,'増加傾向なし');
// Session audit stays diagnostic. It never creates missing match results.
const session={key:rows[115].key,start:at(115),end:at(119),characters:['TERRY'],phase:'unknown',games:5};
const audited=P.analyze({...opts,sessions:[session],sessionRefs:new Map([[
  session.key,{status:'snapshot_matched',lp:250,snapshots:2}
]])});
assert.equal(audited.audit.matched,1);
assert.equal(audited.audit.checked,1);
assert.notEqual(audited.audit.residuals[0].difference,null);
console.log('Master LP promotion: 20/50/100 forecasts, stale, rank threshold, mode switching and match evidence passed');
