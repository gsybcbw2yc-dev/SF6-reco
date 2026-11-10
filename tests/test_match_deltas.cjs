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
assert.equal(global.SF6PhaseConfig.label('unknown'),'Act 14（暫定）');
assert.equal(global.SF6PhaseConfig.label('15'),'15');
assert.equal(global.SF6PhaseConfig.acts[0].source,'user_provisional');

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

// user-reported Act change can be dated without rewriting stored rows.
const transitions=global.SF6PhaseConfig.acts;
transitions.push({act:15,effectiveFrom:'2026-11-11T00:01:00Z',source:'user_provisional'});
assert.equal(global.SF6PhaseConfig.label('unknown',a.occurred_at),'Act 14（暫定）');
assert.equal(global.SF6PhaseConfig.label('unknown',b.occurred_at),'Act 15（暫定）');
assert.equal(D.infer([a,b]).get(a.key).delta,null);
transitions.pop();
console.log('Match MR reference changes, strict sign/gap checks and provisional Act label passed');
