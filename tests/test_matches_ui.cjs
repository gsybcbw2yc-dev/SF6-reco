const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
class Element{constructor(){this.value='';this.textContent='';this.options=[];this.children=[];this.dataset={};this.style={};this.attributes={};this.classList={toggle(){},add(){},remove(){}};}append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=nodes;}add(o){this.options.push(o);}setAttribute(k,v){this.attributes[k]=v;}}
async function run(){
 const nodes=new Map(),get=id=>nodes.get(id)||(nodes.set(id,new Element()),nodes.get(id));
 for(const [id,value] of Object.entries({'match-period':'7','match-mode':'ranked','match-character':'all','match-own-control':'all','match-opponent-control':'all','session-gap':'45','matchup-order':'games','time-bucket':'4'}))get(id).value=value;
 get('match-character').add({value:'all'});
 const document={getElementById:get,createElement:()=>new Element(),querySelectorAll:()=>[]};
 const first={key:'synthetic-hash',occurred_at:'2026-11-09T00:00:00Z',fetched_at:'2026-11-09T01:00:00Z',character:'AKUMA',opponent_character:'RYU',own_side:1,mode:'ranked',own_control:'classic',opponent_control:'modern',phase:'unknown',outcome:'win',missing:[],mr_before:1500,lp_before:50000,mr_delta:null,lp_delta:null};
 let rows=[first],observations=[],hash='a'.repeat(64),offline=false,calls=[],hold;
 const fetch=async url=>{calls.push(url);if(hold)await hold;if(offline)throw Error('offline');return {ok:true,json:async()=>url.includes('index.json')?{schema:1,count:rows.length,months:[{path:'2026-11.json',sha256:hash,count:rows.length,last_at:rows.at(-1).occurred_at}]}:url.includes('status.json')?{last_success:'2026-11-09T01:00:00Z',events:[{added:1,duplicates:0}]}:url.includes('data/history.json')?{observations:structuredClone(observations)}:{schema:1,matches:structuredClone(rows)}};};
 class Clock extends Date{static now(){return Date.parse('2026-11-09T02:00:00Z');}}
 const window={},context=vm.createContext({window,document,fetch,Date:Clock,Option:class{constructor(label,value){this.value=value;}}});
 vm.runInContext(fs.readFileSync('web/match-analysis.js','utf8'),context);vm.runInContext(fs.readFileSync('web/time-performance.js','utf8'),context);vm.runInContext(fs.readFileSync('web/deep-analysis.js','utf8'),context);vm.runInContext(fs.readFileSync('web/phase-config.js','utf8'),context);vm.runInContext(fs.readFileSync('web/match-deltas.js','utf8'),context);vm.runInContext(fs.readFileSync('web/match-goal-forecast.js','utf8'),context);vm.runInContext(fs.readFileSync('web/master-promotion-forecast.js','utf8'),context);vm.runInContext(fs.readFileSync('web/master-promotion-ui.js','utf8'),context);vm.runInContext(fs.readFileSync('web/match-goal-ui.js','utf8'),context);vm.runInContext(fs.readFileSync('web/matches-ui.js','utf8'),context);
 const app=window.matchDashboard;await app.refresh();assert.equal(calls.length,4);assert.equal(get('match-list').children.length,1);assert.equal(get('match-character').value,'AKUMA');
 assert.equal(get('match-list').children[0].children.length,3); // header plus only date and pre-match values
 assert.equal(get('match-list').children[0].children[0].children[1].children[0].textContent,'— MR');
 await app.refresh();assert.equal(calls.length,7); // unchanged monthly archive is not downloaded again
 rows.push({...first,key:'second-synthetic-hash',occurred_at:'2026-11-09T00:02:00Z',outcome:'loss'});hash='b'.repeat(64);
 await app.refresh();assert.equal(calls.length,11);assert.equal(get('match-list').children.length,2);assert.match(get('match-summary').textContent,/1勝 1敗/);
 const matchupCards=get('matchup-list').children;
 assert.equal(matchupCards.length,1);
 const bar=matchupCards[0].children.find(n=>n.className==='matchup-bar');
 assert.ok(bar,'stacked matchup bar exists');
 assert.equal(bar.children.length,2);
 assert.equal(bar.children[0].className,'matchup-bar-segment win');
 assert.equal(bar.children[1].className,'matchup-bar-segment loss');
 assert.equal(bar.children[0].style.width,'50%');
 assert.equal(bar.children[1].style.width,'50%');
 assert.equal(get('time-performance-hours').children.length,6);
 assert.equal(get('time-performance-weekdays').children.length,7);
 assert.equal(get('deep-streak-list').children.length,4);
 assert.equal(get('deep-rating-list').children.length,5);
 assert.equal(get('deep-position-list').children.length,4);
 assert.equal(get('deep-recent-list').children.length,3);
 assert.match(get('deep-recent-note').textContent,/ランクマッチ/);

 assert.match(get('time-performance-status').textContent,/2試合/);
 get('time-bucket').value='1';get('time-bucket').onchange();
 assert.equal(get('time-performance-hours').children.length,24);
 get('time-bucket').value='4';get('time-bucket').onchange();
 assert.equal(get('time-performance-hours').children.length,6);
 offline=true;await app.refresh();assert.equal(get('match-list').children.length,2);assert.match(get('match-refresh').textContent,/前回の表示を保持/);
 offline=false;await app.refresh();assert.match(get('match-refresh').textContent,/最終画面確認/);
 let release;hold=new Promise(r=>release=r);const pending=app.refresh();const before=calls.length;app.refresh();assert.equal(calls.length,before);hold=null;release();await pending;await new Promise(r=>setImmediate(r));assert.equal(app.busy,false);
 // A subsequent ranked session plus periodic rating snapshots corroborate the earlier closing balance.
 rows.push({...first,key:'next-session-hash',occurred_at:'2026-11-09T00:50:00Z',
   mr_before:1510,lp_before:50080,outcome:'win'});
 observations=[{character:'AKUMA',phase:'unknown',mr:1510,lp:50080,
   observed_at:'2026-11-09T00:18:00Z'}];
 hash='c'.repeat(64);
 await app.refresh();
 assert.equal(get('session-list').children.length,2);
 const oldSession=get('session-list').children.at(-1);
 const deltaText=oldSession.children.find(e=>String(e.textContent).includes('記録上のMR/LP収支'));
 assert.ok(deltaText,'session reference delta is shown');
 assert.ok(deltaText.textContent.includes('+10 / +80'));
 assert.match(deltaText.textContent,/定期観測と一致/);
 const newestSession=get('session-list').children[0];
 assert.match(newestSession.children.map(e=>e.textContent).join(' '),/算定不可/);

 // A real adjacent match supports only an inferred reference delta, and the
 // compact card no longer shows the old outcome/control/phase line or expander.
 rows.push({...first,key:'following-ranked',occurred_at:'2026-11-09T00:53:00Z',
   mr_before:1518,lp_before:50330,outcome:'loss'});
 hash='d'.repeat(64);
 await app.refresh();
 const latestCard=get('match-list').children[0];
 const previousCard=get('match-list').children[1];
 const prevHead=previousCard.children[0];
 assert.equal(prevHead.children[1].children[0].textContent,'+8 MR');
 assert.equal(prevHead.children[1].children[1].textContent,'推定');
 assert.equal(prevHead.children[1].className,'battle-mr-indicator positive');
 assert.equal(previousCard.children.length,3); // no metadata row, no expanded details
 assert.equal(latestCard.children[0].children[1].children[0].textContent,'— MR');
 assert.ok(get('match-warning').textContent.includes('Act 14'));
 assert.match(get('goal-forecast-quality').textContent,/予測|ランクマッチ|更新/);
 assert.match(get('goal-window-20-evidence').textContent,/試合/);
 assert.equal(get('goal-1500-20-games').textContent,'達成済み');
 assert.equal(get('goal-1600-20-games').textContent,'データ不足');
 assert.ok(get('goal-forecast-audit').textContent.includes('セッション境界'));

 // Terry is collected from the same profile. The rank archive and LP remain
 // usable even though its pre-match MR (and periodic MR) is zero.
 rows.push({...first,key:'terry-ranked',character:'TERRY',opponent_character:'AKUMA',
   occurred_at:'2026-11-09T00:56:00Z',outcome:'win',mr_before:0,lp_before:22617});
 observations.push({character:'TERRY',phase:'unknown',mr:0,lp:22617,
   observed_at:'2026-11-09T01:30:00Z'});
 hash='e'.repeat(64);
 await app.refresh();
 assert.ok(get('match-character').options.some(x=>x.value==='TERRY'));
 let selectedFromMatches=null;
 window.onSf6MatchCharacterChange=ch=>{selectedFromMatches=ch;};
 get('match-character').value='TERRY';
 get('match-character').onchange();
 assert.equal(selectedFromMatches,'TERRY');
 assert.equal(get('match-list').children.length,1);
 assert.match(get('match-list').children[0].children[0].children[0].textContent,/TERRY/);
 assert.equal(get('goal-master-panel').hidden,false);
 assert.equal(get('goal-mr-panel').hidden,true);
 assert.equal(get('goal-forecast-title').textContent,'マスターまで、あと何試合？');
 assert.equal(get('master-goal-rank').textContent,'ダイヤモンド ★4');
 assert.equal(get('master-goal-remaining').textContent,'あと 2,383 LP');
 assert.equal(get('master-goal-20-games').textContent,'データ不足');
 assert.match(get('master-window-20-evidence').textContent,/推定可能/);
 assert.equal(get('master-goal-progress').attributes?.['aria-valuenow'],'22617');
 get('match-character').value='AKUMA';
 get('match-character').onchange();
 assert.equal(get('goal-master-panel').hidden,true);
 assert.equal(get('goal-mr-panel').hidden,false);
 assert.equal(get('goal-forecast-title').textContent,'あと何試合で到達するか');
 console.log('Monthly match UI, Terry character filter, LP-only MR forecast guard passed (synthetic)');
}
run().catch(e=>{console.error(e);process.exitCode=1;});
