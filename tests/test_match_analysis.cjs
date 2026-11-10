const assert=require('node:assert/strict');
const A=require('../web/match-analysis.js');
const start=Date.parse('2026-11-09T00:00:00Z');
function row(i,outcome='win',extra={}){return {key:String(i),occurred_at:new Date(start+i*60000).toISOString(),character:'AKUMA',opponent_character:'RYU',mode:'ranked',phase:'unknown',own_control:'classic',opponent_control:'modern',outcome,mr_before:1500+i,lp_before:50000+i,mr_delta:null,lp_delta:null,delta_basis:'unavailable_no_verified_post_match_rating',...extra};}
const rows=[row(0),row(1),row(2,'draw'),row(3,'loss'),row(4,'unknown'),row(49,'win')];
let s=A.sessions(rows);
assert.equal(s.length,2);assert.equal(s[0].games,1);assert.equal(s[1].maxWins,2);assert.equal(s[1].maxLosses,1);
assert.equal(s[1].referenceMr,null);assert.equal(s[1].mrDelta,null);
assert.equal(A.sessions([row(0),row(44.99)]).length,1);
assert.equal(A.sessions([row(0),row(45)]).length,2);
assert.equal(A.sessions([row(0,'win',{phase:'1'}),row(1,'win',{phase:'2'})]).length,2);
s=A.sessions([row(0,'win',{phase:'1'}),row(1,'win',{phase:'1'})]);
assert.equal(s[0].referenceMr,1);assert.equal(s[0].mrDelta,null); // pre-match difference is never an exact match change
s=A.sessions([row(0),row(0,'loss',{key:'tie'})]);assert.equal(s[0].maxWins,null);assert.equal(s[0].orderUncertain,true);
const filtered=A.filter([...rows,row(8,'win',{mode:'casual'})],{now:start+86400000});
assert.equal(filtered.length,rows.length); // default ranked only
assert.equal(A.filter(rows,{opponentControl:'classic',now:start+86400000}).length,0);
let m=A.matchups(rows);assert.equal(m.length,1);assert.equal(m[0].wins,3);assert.equal(m[0].losses,1);assert.equal(m[0].draws,1);assert.equal(m[0].unknown,1);assert.equal(m[0].winRate,60);
m=A.matchups([row(0,'draw',{opponent_character:'AKUMA'})]);assert.equal(m[0].winRate,0);assert.equal(m[0].smallSample,true);
assert.equal(A.stats([row(0,'unknown')]).winRate,null);
assert.equal(A.stats([row(0,'win',{phase:'1',mr_delta:8,lp_delta:20,delta_basis:'verified_post_match_rating'})]).mrDelta,8);
assert.equal(A.stats([row(0,'win',{phase:'1',mr_delta:8,delta_basis:'verified_post_match_rating'}),row(1,'win',{phase:'2',mr_delta:5,delta_basis:'verified_post_match_rating'})]).mrDelta,null);
assert.equal(A.compare(null,null),null);
assert.deepEqual(A.compare({games:10,winRate:60,elapsedMinutes:30},{games:5,winRate:50,elapsedMinutes:20}),{games:5,winRate:10,elapsedMinutes:10});
// Session boundary reconciliation: next-session opening pre-match rating and snapshots.
const groupRows=[row(0),row(1,'loss'),row(46,'win',{mr_before:1520,lp_before:50100})];
const snap={character:'AKUMA',phase:'unknown',observed_at:new Date(start+16*60000).toISOString(),mr:1520,lp:50100};
let recon=A.reconcileSessionDeltas(groupRows,[snap]);
const older=A.sessions(groupRows).at(-1);
let value=recon.get(older.key);
assert.equal(value.status,'snapshot_matched');
assert.equal(value.mr,20);
assert.equal(value.lp,100);
assert.equal(value.snapshots,1);
assert.equal(value.games,2);
assert.equal(value.endKey,groupRows[1].key);
assert.equal(A.reconcileSessionDeltas(groupRows,[]).get(older.key).status,'next_session_only');
recon=A.reconcileSessionDeltas(groupRows,[{...snap,mr:1521}]);
assert.equal(recon.get(older.key).status,'conflict');
assert.equal(recon.get(older.key).mr,null); // contradictory snapshots never claim an amount
const lastSession=A.sessions(groupRows)[0];
recon=A.reconcileSessionDeltas(groupRows,[{...snap,observed_at:new Date(start+60*60000).toISOString()}]);
assert.equal(recon.get(lastSession.key).status,'unavailable'); // snapshot's value is pre-match 0-min baseline, not a closing observation
recon=A.reconcileSessionDeltas(groupRows,[
 {character:'AKUMA',phase:'unknown',observed_at:new Date(start+58*60000).toISOString(),mr:1529,lp:50140},
 {character:'AKUMA',phase:'unknown',observed_at:new Date(start+65*60000).toISOString(),mr:1529,lp:50140}
]);
assert.equal(recon.get(lastSession.key).status,'snapshot_provisional');
assert.equal(recon.get(lastSession.key).mr,9);
assert.equal(recon.get(lastSession.key).lp,40);
assert.equal(A.reconcileSessionDeltas([groupRows[0],{...groupRows[2],character:'KEN'}],[]).get(groupRows[0].key).status,'unavailable');
console.log('Match/session/matchup analysis scenarios passed (synthetic)');
