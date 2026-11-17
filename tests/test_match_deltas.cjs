const assert=require('node:assert/strict');
global.SF6PhaseConfig=require('../web/phase-config.js');
const D=require('../web/match-deltas.js');
const start=Date.parse('2026-11-11T00:00:00Z');
const match=(id,mins,mr,outcome='win',extra={})=>({
 key:'match-'+id,occurred_at:new Date(start+mins*60000).toISOString(),
 character:'AKUMA',phase:'unknown',mode:'ranked',
 mr_before:mr,lp_before:100000+mins*10,
 outcome,...extra
});
assert.equal(global.SF6PhaseConfig.label('unknown'),'Act不明');
assert.equal(global.SF6PhaseConfig.currentAct,null);
global.SF6PhaseConfig.setVerifiedObservations([{
 observed_at:'2026-11-11T00:10:00Z',character:'AKUMA',phase:'14',
 phase_source:'play_page.play.current_season_id'}]);
assert.equal(global.SF6PhaseConfig.label('15'),'Act 15');
assert.equal(global.SF6PhaseConfig.acts[0].source,'official');

const a=match('a',0,1400,'win',{lp_before:100000});
const b=match('b',3,1408,'loss',{lp_before:100250});
const c=match('c',5,1400,'win',{lp_before:100210});
const changes=D.infer([c,a,b]);
assert.equal(changes.get(a.key).delta,8);
assert.equal(changes.get(a.key).basis,'inferred');
assert.equal(changes.get(b.key).delta,-8);
assert.equal(changes.get(c.key).basis,'unavailable');
assert.equal(changes.get(c.key).delta,null);
assert.equal(D.MAX_GAP_MINUTES,10);

// No invented change across unmatched or ambiguous snapshots.
assert.equal(D.infer([a,match('far',11,1410)]).get(a.key).delta,null);
assert.equal(D.infer([a,match('casual',3,1408,'win',{mode:'casual'})]).get(a.key).delta,null);
assert.equal(D.infer([a,match('ken',3,1408,'win',{character:'KEN'})]).get(a.key).delta,null);
assert.equal(D.infer([a,match('phase',3,1408,'win',{phase:'15'})]).get(a.key).delta,null);
assert.equal(D.infer([a,match('zero',3,1400)]).get(a.key).delta,null);
assert.equal(D.infer([a,match('wrong',3,1390)]).get(a.key).delta,null);
assert.equal(D.infer([a,match('huge',3,1490)]).get(a.key).delta,null);
assert.equal(D.infer([a,match('unknown',3,1408,'unknown')]).get(a.key).delta,8); // current outcome determines its result
assert.equal(D.infer([{...a,outcome:'unknown'},b]).get(a.key).delta,null);
assert.equal(D.infer([a,match('missing',3,null)]).get(a.key).delta,null);
assert.equal(D.infer([a,match('lp-contrary',3,1408,'win',{lp_before:99900})]).get(a.key).delta,null);
assert.equal(D.infer([a,match('tie1',3,1408),match('tie2',3,1416)]).get(a.key).delta,null);
assert.equal(D.infer([a,match('early',0,1410)]).get(a.key).delta,null);
assert.equal(D.infer([a,match('latest',3,1408,'win',{delta_basis:'verified_post_match_rating',mr_delta:12})])
 .get('match-latest').delta,12);
assert.equal(D.infer([a,match('next',3,1408),match('next2',5,1417) ]).get('match-next').delta,9);

// ACT transition is sourced only from verified PLAY snapshots.
global.SF6PhaseConfig.setVerifiedObservations([
 {observed_at:'2026-11-11T00:00:00Z',phase:'14',phase_source:'play_page.play.current_season_id'},
 {observed_at:'2026-11-11T00:01:00Z',phase:'15',phase_source:'play_page.play.current_season_id'}
]);
assert.equal(global.SF6PhaseConfig.label('unknown',a.occurred_at),'Act 14');
assert.equal(global.SF6PhaseConfig.label('unknown',b.occurred_at),'Act 15');
assert.equal(D.infer([a,b]).get(a.key).delta,null);
global.SF6PhaseConfig.setVerifiedObservations([]);
// Last ranked match is settled by official current MR, even if casual games follow.
const snapshot=(mins,mr,lp,extra={})=>({character:'AKUMA',phase:'14',
  observed_at:new Date(start+mins*60000).toISOString(),mr,lp,
  source:'periodic_buckler_snapshot',rating_source:'play_character_league_infos',
  phase_source:'play_page.play.current_season_id',...extra});
const last=match('last',20,1498,'win',{phase:'14',lp_before:117217});
const casual=match('casual-after',30,1505,'loss',{mode:'casual',phase:'14',lp_before:117270});
const obs=[snapshot(29,1505,117270),snapshot(60,1505,117270),snapshot(240,1505,117270)];
const final=D.infer([last,casual],obs).get(last.key);
assert.equal(final.delta,7);
assert.equal(final.source,'periodic_snapshot');
assert.equal(final.basis,'inferred');
assert.equal(final.observedAt,obs[2].observed_at);
assert.equal(D.infer([last,casual],obs).get(casual.key).delta,null);
const nextDay=match('next-day',1440,1505,'win',{phase:'14',lp_before:117270});
assert.equal(D.infer([last,casual,nextDay],obs).get(last.key).delta,7);
assert.equal(D.infer([last,{...nextDay,mr_before:1513}],obs).get(last.key).delta,null);
assert.equal(D.infer([last,casual],[snapshot(29,1505,117270),snapshot(60,1512,117330)]).get(last.key).delta,null);
assert.equal(D.infer([last,casual],[snapshot(29,1505,117270,{character:'KEN'})]).get(last.key).delta,null);
assert.equal(D.infer([last,casual],[snapshot(29,1505,117270,{phase:'15'})]).get(last.key).delta,null);
assert.equal(D.infer([last,casual],[snapshot(29,1505,117270,{source:'unverified'})]).get(last.key).delta,null);
assert.equal(D.infer([last,casual],[snapshot(19,1505,117270)]).get(last.key).delta,null);
assert.equal(D.infer([last,casual],[snapshot(240,1505,117270)]).get(last.key).delta,null);
assert.equal(D.infer([last,casual],[snapshot(29,1493,117200)]).get(last.key).delta,null);
assert.equal(D.infer([last,casual],[snapshot(29,1505,117200)]).get(last.key).delta,null);
assert.equal(D.infer([last,casual],[snapshot(29,1560,117270)]).get(last.key).delta,null);
assert.equal(D.infer([last,{...casual,occurred_at:last.occurred_at}],obs).get(last.key).delta,null);
assert.equal(D.infer([{...last,outcome:'loss'},casual],[snapshot(29,1491,117170)]).get(last.key).delta,-7);
global.SF6PhaseConfig.setVerifiedObservations([snapshot(10,1498,117217),...obs]);
assert.equal(D.infer([{...last,phase:'unknown'},casual],obs).get(last.key).delta,7);
global.SF6PhaseConfig.setVerifiedObservations([snapshot(10,1498,117217,{phase:'13'}),...obs]);
assert.equal(D.infer([{...last,phase:'unknown'},casual],obs).get(last.key).delta,null);
global.SF6PhaseConfig.setVerifiedObservations([]);
console.log('Match MR reference changes, strict sign/gap checks and provisional Act label passed');
