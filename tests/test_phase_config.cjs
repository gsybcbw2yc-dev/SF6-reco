const assert=require('node:assert/strict');
const Phase=require('../web/phase-config.js');
const Fair=require('../web/fair-rating.js');
const Goal=require('../web/match-goal-forecast.js');
const Master=require('../web/master-promotion-forecast.js');
global.SF6PhaseConfig=Phase;
const Deltas=require('../web/match-deltas.js');

const t0='2026-11-14T23:00:00Z';
const t1='2026-11-15T00:00:00Z';
const t2='2026-11-15T01:00:00Z';
const t3='2026-11-15T02:00:00Z';
const t4='2026-11-15T03:00:00Z';
const observation=(time,act,character='AKUMA')=>({
  observed_at:time,character,phase:String(act),
  phase_source:'play_page.play.current_season_id'
});
assert.equal(Phase.currentAct,null);
assert.equal(Phase.label('unknown',t0),'Act不明');
assert.equal(Phase.setVerifiedObservations([
  observation(t3,15),observation(t1,14),observation(t1,14,'TERRY'),
  observation(t2,14),observation(t4,15),{...observation(t0,44),phase_source:null}
  ]),4);
assert.equal(Phase.currentAct,15);
assert.equal(Phase.latestVerified().act,15);
assert.equal(Phase.assignedAct(t0).act,14);
assert.equal(Phase.assignedAct(t0).source,'retrospective_inference');
assert.equal(Phase.assignedAct('2026-11-15T00:30:00Z').act,14);
assert.equal(Phase.assignedAct('2026-11-15T00:30:00Z').source,'official_observation');
assert.equal(Phase.label('unknown','2026-11-15T00:30:00Z'),
  'Act 14');
assert.equal(Phase.assignedAct('2026-11-15T01:30:00Z').act,null);
assert.equal(Phase.label('unknown','2026-11-15T01:30:00Z'),
  'Act不明');
assert.equal(Phase.assignedAct(t3).act,15);
assert.equal(Phase.assignedAct('2026-11-15T02:30:00Z').act,15);
assert.equal(Phase.label('15'),'Act 15');
assert.equal(Phase.phaseKey('unknown',t0),'14');
assert.equal(Phase.phaseKey('14',t0),'14');
assert.equal(Phase.resolve('unknown',t0).inferred,true);
assert.equal(Phase.resolve('14',t0).inferred,false);

const match=(id,at,phase='unknown',character='AKUMA')=>({
 key:id,mode:'ranked',character,phase,occurred_at:at,
 mr_before:1400,opponent_mr_before:1400,lp_before:24000,outcome:'win'
});
assert.equal(Fair.period(match('old',t0),Phase.assignedAct).key,'act:14');
assert.equal(Fair.period(match('new','2026-11-15T02:30:00Z'),Phase.assignedAct).key,'act:15');
assert.equal(Fair.period(match('boundary','2026-11-15T01:30:00Z'),Phase.assignedAct).key,'unknown');
const uncertainA=match('uncertainA','2026-11-15T01:30:00Z');
const uncertainB={...match('uncertainB','2026-11-15T01:33:00Z'),mr_before:1408,lp_before:24100};
assert.equal(Deltas.infer([uncertainA,uncertainB]).get('uncertainA').delta,null);
assert.equal(Master.inferLP([uncertainA,uncertainB],time=>Phase.assignedAct(time).act).get('uncertainA').delta,null);

const now=Date.parse('2026-11-15T03:15:00Z');
const battles=[
 match('old1','2026-11-15T00:30:00Z'),
 match('new1','2026-11-15T02:10:00Z'),
 match('new2','2026-11-15T02:13:00Z')];
const observations=[{...observation(t4,15),mr:1450,lp:25000}];
const actAt=time=>Phase.assignedAct(time).act;
const deltas=new Map(battles.map(r=>[r.key,{delta:8,basis:'inferred'}]));
const result=Goal.analyze({rows:battles,observations,deltas,
 character:'AKUMA',now,actAt});
assert.equal(result.act,15);
assert.equal(result.storedGames,2);
assert.equal(result.current,1450);
const terryBattles=battles.map(x=>({...x,character:'TERRY',mr_before:0}));
const terryObservations=[{...observation(t4,15,'TERRY'),mr:0,lp:24500}];
const prom=Master.analyze({rows:terryBattles,observations:terryObservations,
 character:'TERRY',now,actAt});
assert.equal(prom.currentAct,15);
assert.equal(prom.storedGames,2);
assert.equal(prom.currentLP,24500);
// Same ACT at both sides must not be inferred to cover an unobserved switch.
assert.equal(Phase.setVerifiedObservations([]),0);
assert.equal(Phase.currentAct,null);
assert.equal(Phase.label('unknown',t4),'Act不明');
// Regression against the actually preserved archives. Raw phase stays unknown,
// but both historic and directly recorded observations must share Act 14.
// No test assumes a later Act15 event has not happened.
const fs=require('node:fs');
const archive=JSON.parse(fs.readFileSync('web/data/matches/2026-11.json','utf8'));
const history=JSON.parse(fs.readFileSync('web/data/history.json','utf8'));
assert.ok(history.observations.some(r=>r.phase==='unknown'));
assert.ok(history.observations.some(r=>r.phase==='14'&&
  r.phase_source==='play_page.play.current_season_id'));
Phase.setVerifiedObservations(history.observations);
assert.equal(Phase.phaseKey('unknown',history.observations[0].observed_at),'14');
assert.equal(Phase.phaseKey('14',history.observations[0].observed_at),'14');
const actual=Fair.analyze(archive.matches,{character:'AKUMA',actAt:Phase.assignedAct});
const act14=actual.acts.find(x=>x.key==='act:14');
assert.ok(act14&&act14.count>=100);
assert.ok(act14.inferredN>0);
assert.ok(act14.retrospectiveN>0);
assert.ok(actual.acts.every(x=>/^act:\\d+$/.test(x.key)));
console.log('Verified official ACT-only grouping, retrospective provenance, real archive analysis and forecasting passed');
