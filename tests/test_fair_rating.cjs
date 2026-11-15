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
// Rolling estimates use only the exact preceding window, with no future
// matches or crossing between ACTs. The newest point always gets recomputed.
const clean=F.clean(rows,opts);
const roll=report.rolling;
assert.deepEqual(roll.windows,[50,100,200]);
assert.equal(roll.points.at(-1).count,640);
assert.ok(roll.series[100].some(p=>p.crossing!==null));
for(const n of roll.windows){
  assert.ok(roll.series[n].filter(p=>p.count<n).every(p=>p.crossing===null));
  const p=roll.series[n].at(-1),sample=clean.slice(-n),m=F.fit(sample),c=F.conditions(sample,m,n===50?50:100);
  assert.equal(p.crossing,c.ok?m.cross:null);
  const prefix=F.rolling(clean.slice(0,400));
  assert.deepEqual(prefix.series[n],roll.series[n].filter(p=>p.count<=400));
}
assert.ok(separated.rolling.series[50].every(p=>p.crossing===null));
assert.equal(explicit.rolling.points.at(-1).count,450);
const tied=clean.slice(0,110).map((r,i)=>i===10?{...r,t:clean[9].t}:r);
assert.match(F.rolling(tied).series[100].at(-1).reason,/同時刻/);
assert.ok(F.rolling(F.clean(opposite,opts)).series[100].every(p=>p.crossing===null));
// The same strength-adjustment model, trained only on earlier sessions,
// exposes a deliberately stronger/weaker opponent-character effect.
const mixed=[];
for(let si=0;si<20;si++){
  for(let i=0;i<40;i++){
    const opp=1200+Math.floor(random()*450),char=i%2?'RYU':'KEN';
    const p=F.sigmoid(-.8*(opp-1400)/100+(char==='RYU'?.8:-.8));
    mixed.push({key:'mixed-'+si+'-'+i,t:Date.UTC(2026,10,1+si,0,i),opp,own:1400,opponent:char,y:Number(random()<p)});
  }
}
const scored=F.adjustedMatchups(mixed),ryu=scored.matchups.find(x=>x.character==='RYU'),ken=scored.matchups.find(x=>x.character==='KEN');
assert.ok(ryu.qualified&&ken.qualified&&ryu.delta>0&&ken.delta<0);
assert.ok(scored.tested+scored.skipped===mixed.length);
assert.ok(scored.tested<mixed.length-100);
assert.equal(F.adjustedMatchups(mixed.slice(0,40)).tested,0);
const first=F.adjustedMatchups(mixed.slice(0,400));
const changed=F.adjustedMatchups(mixed.slice(0,400).map((r,i)=>i<360?r:{...r,y:1-r.y}));
assert.equal(first.tested,changed.tested);
for(const m of first.matchups){const other=changed.matchups.find(x=>x.character===m.character);assert.equal(m.expected,other.expected);}
assert.equal(F.adjustedMatchups(mixed.map(r=>({...r,opponent:'unknown'}))).tested,0);
// UI contract: required IDs exist in HTML, event handlers render both views,
// changing the window redraws the chart without changing the ACT/character.
const html=require('node:fs').readFileSync(require('node:path').join(__dirname,'../web/index.html'),'utf8');
class FakeNode{
  constructor(tag){this.tagName=tag;this.children=[];this.options=[];this.style={};this.attributes={};this.value='';this.textContent='';}
  append(...children){this.children.push(...children);}
  add(option){this.options.push(option);}
  replaceChildren(){this.children=[];}
  setAttribute(k,v){this.attributes[k]=v;}
}
const ids=new Map([...html.matchAll(/id="([^"]+)"/g)].map(m=>[m[1],new FakeNode('id')]));
global.document={getElementById:id=>ids.get(id),createElement:tag=>new FakeNode(tag),createElementNS:(_,tag)=>new FakeNode(tag)};
global.Option=class{constructor(label,value){this.label=label;this.value=value;}};
global.SF6PhaseConfig={assignedAct:()=>14,version:()=>14};
ids.get('fair-window').value='100';
require('../web/fair-rating-ui.js');
global.SF6FairRatingUI.render(rows);
assert.equal(ids.get('fair-character').value,'AKUMA');
assert.equal(ids.get('fair-act').value,'act:14');
assert.equal(ids.get('fair-rolling-chart').children[0].tagName,'svg');
assert.ok(ids.get('fair-adjusted-body').children.length);
ids.get('fair-window').value='200';ids.get('fair-window').onchange();
assert.match(ids.get('fair-rolling-chart').children[0].attributes['aria-label'],/200試合/);
global.SF6FairRatingUI.render([]);
assert.match(ids.get('fair-rolling-summary').textContent,/対象データなし/);
assert.match(ids.get('fair-adjusted-body').children[0].children[0].textContent,/対象/);
console.log('Equal-win MR: ACT separation, session bootstrap, leakage-free backtest and fail-closed modeling passed');
console.log('Rolling MR and adjusted matchups: exact windows, timestamp ties, ACT isolation, past-only scoring and sparse-data guards passed');

