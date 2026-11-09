const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
class Element{constructor(){this.value='';this.textContent='';this.options=[];this.children=[];this.dataset={};this.classList={toggle(){},add(){},remove(){}};}append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=nodes;}add(o){this.options.push(o);}setAttribute(){}}
async function run(){
 const nodes=new Map(),get=id=>nodes.get(id)||(nodes.set(id,new Element()),nodes.get(id));
 for(const [id,value] of Object.entries({'match-period':'7','match-mode':'ranked','match-character':'all','match-own-control':'all','match-opponent-control':'all','session-gap':'45','matchup-order':'games'}))get(id).value=value;
 get('match-character').add({value:'all'});
 const document={getElementById:get,createElement:()=>new Element(),querySelectorAll:()=>[]};
 const first={key:'synthetic-hash',occurred_at:'2026-11-09T00:00:00Z',fetched_at:'2026-11-09T01:00:00Z',character:'AKUMA',opponent_character:'RYU',own_side:1,mode:'ranked',own_control:'classic',opponent_control:'modern',phase:'unknown',outcome:'win',missing:[],mr_before:1500,lp_before:50000,mr_delta:null,lp_delta:null};
 let rows=[first],hash='a'.repeat(64),offline=false,calls=[],hold;
 const fetch=async url=>{calls.push(url);if(hold)await hold;if(offline)throw Error('offline');return {ok:true,json:async()=>url.includes('index.json')?{schema:1,count:rows.length,months:[{path:'2026-11.json',sha256:hash,count:rows.length,last_at:rows.at(-1).occurred_at}]}:url.includes('status.json')?{last_success:'2026-11-09T01:00:00Z',events:[{added:1,duplicates:0}]}:{schema:1,matches:structuredClone(rows)}};};
 class Clock extends Date{static now(){return Date.parse('2026-11-09T02:00:00Z');}}
 const window={},context=vm.createContext({window,document,fetch,Date:Clock,Option:class{constructor(label,value){this.value=value;}}});
 vm.runInContext(fs.readFileSync('web/match-analysis.js','utf8'),context);vm.runInContext(fs.readFileSync('web/matches-ui.js','utf8'),context);
 const app=window.matchDashboard;await app.refresh();assert.equal(calls.length,3);assert.equal(get('match-list').children.length,1);assert.equal(get('match-character').value,'AKUMA');
 await app.refresh();assert.equal(calls.length,5); // unchanged monthly archive is not downloaded again
 rows.push({...first,key:'second-synthetic-hash',occurred_at:'2026-11-09T00:02:00Z',outcome:'loss'});hash='b'.repeat(64);
 await app.refresh();assert.equal(calls.length,8);assert.equal(get('match-list').children.length,2);assert.match(get('match-summary').textContent,/1勝 1敗/);
 offline=true;await app.refresh();assert.equal(get('match-list').children.length,2);assert.match(get('match-refresh').textContent,/前回の表示を保持/);
 offline=false;await app.refresh();assert.match(get('match-refresh').textContent,/最終画面確認/);
 let release;hold=new Promise(r=>release=r);const pending=app.refresh();const before=calls.length;app.refresh();assert.equal(calls.length,before);hold=null;release();await pending;await new Promise(r=>setImmediate(r));assert.equal(app.busy,false);
 console.log('Monthly match UI refresh/cache/recovery scenarios passed (synthetic)');
}
run().catch(e=>{console.error(e);process.exitCode=1;});
