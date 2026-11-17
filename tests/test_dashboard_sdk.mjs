import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Window} from 'happy-dom';
const w=new Window({url:'https://example.test/SF6-reco/'});
for(const key of Object.getOwnPropertyNames(w))if(!(key in globalThis))try{globalThis[key]=w[key];}catch{}
for(const key of ['window','document','HTMLElement','Element','Node','Event','CustomEvent','MutationObserver','Option','HTMLSelectElement','customElements','getComputedStyle','requestAnimationFrame','cancelAnimationFrame','ResizeObserver','IntersectionObserver','DOMRect','HTMLButtonElement','HTMLInputElement','HTMLFormElement','ShadowRoot','Document','CSS','navigator','addEventListener','removeEventListener','dispatchEvent']){
  if(w[key]!==undefined)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:typeof w[key]==='function'&&/^(getComputedStyle|requestAnimationFrame|cancelAnimationFrame|addEventListener|removeEventListener|dispatchEvent)$/.test(key)?w[key].bind(w):w[key]});
}
globalThis.window=w;
globalThis.Option=function(label,value){const e=w.document.createElement('option');e.textContent=label;e.value=value;return e;};
w.HTMLElement.prototype.attachInternals??=function(){return {setFormValue(){},setValidity(){},form:null,labels:[],states:new Set()};};
const html=fs.readFileSync('web/index.html','utf8');w.document.body.innerHTML=html.split('<body>')[1].split('</main>')[0]+'</main>';
const $=id=>w.document.getElementById(id),run=path=>(0,eval)(fs.readFileSync('web/'+path+'.js','utf8'));
run('view-navigation');run('matchup-improvement');run('matchup-improvement-ui');w.SF6ImprovementUI=globalThis.SF6ImprovementUI;
for(const [attr,prefix] of [['match-tab','match-panel-'],['deep-tab','deep-panel-']]){
  const bs=[...w.document.querySelectorAll(`[data-${attr}]`)];for(const b of bs)b.onclick=()=>{for(const x of bs){x.classList.toggle('active',x===b);$(prefix+x.getAttribute(`data-${attr}`)).hidden=x!==b;}};
}
for(const b of w.document.querySelectorAll('[data-range],[data-window]'))b.onclick=()=>{for(const x of b.parentElement.querySelectorAll('button'))x.classList.toggle('active',x===b);};
for(const b of w.document.querySelectorAll('[data-chart][data-layer]'))b.onclick=()=>b.setAttribute('aria-pressed',String(b.getAttribute('aria-pressed')!=='true'));
$('character').add(new Option('AKUMA','AKUMA'));$('character').add(new Option('TERRY','TERRY'));$('character').value='AKUMA';
$('fair-act').add(new Option('Act 14','act:14'));$('fair-act').value='act:14';
const rows=[],delta=new Map();for(let i=0;i<100;i++){const y=i<20?Number(i<6):Number(i%2===0);rows.push({key:String(i),opponent:i<20?'ZANGIEF':'RYU',y});delta.set(String(i),{basis:'inferred',delta:y?8:-8});}
$('improve-target').value='20';$('improve-horizon').value='100';SF6ImprovementUI.render(rows,delta);assert.equal($('improve-gain').textContent,'+64.0 MR');
const tools=new Map();w.document.modelContext={registerTool(tool,{signal}){tools.set(tool.name,tool);signal.addEventListener('abort',()=>tools.delete(tool.name));}};
await import('../web/dashboard-sdk.js');
const toggle=$('dashboard-sdk-toggle'),wait=async fn=>{for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,20));}throw Error($('dashboard-sdk-status').textContent);};
toggle.click();await wait(()=>!toggle.disabled);const bridge=w.SF6DashboardSDK;
assert.equal(bridge.status().active,true);assert.equal(tools.size,6);assert.equal(w.document.querySelectorAll('ui-select').length,16);
assert.equal((await bridge.setFilter({id:'character',value:'TERRY'})).ok,true);assert.equal($('character').value,'TERRY');
assert.equal(bridge.navigate({group:'range',value:'30'}).range,'30');assert.equal(bridge.chartLayer({chart:'mr',layer:'observed',enabled:false}).enabled,false);
assert.rejects(bridge.setFilter({id:'fair-window',value:'50'}));
bridge.navigate({group:'view',value:'matches'});assert.equal((await bridge.setFilter({id:'match-period',value:'all'})).ok,true);assert.ok($('match-period').closest('details').open);
bridge.navigate({group:'matches',value:'sessions'});assert.equal((await bridge.setFilter({id:'session-gap',value:'90'})).ok,true);
bridge.navigate({group:'matches',value:'matchups'});assert.equal((await bridge.setFilter({id:'matchup-order',value:'worst'})).ok,true);
bridge.navigate({group:'view',value:'analysis'});bridge.navigate({group:'analysis',value:'timeofday'});
assert.equal((await bridge.setFilter({id:'time-bucket',value:'1'})).ok,true);
bridge.navigate({group:'analysis',value:'fairmr'});
assert.equal((await bridge.setFilter({id:'improve-opponent',value:'ZANGIEF'})).ok,true);
assert.equal((await bridge.setFilter({id:'improve-target',value:'50pct'})).ok,true);
assert.equal((await bridge.setFilter({id:'improve-horizon',value:'200'})).ok,true);
assert.equal(bridge.report().improvement.gain,128);
await assert.rejects(bridge.setFilter({id:'improve-horizon',value:'999'}));assert.equal($('improve-horizon').value,'200');
bridge.navigate({group:'view',value:'system'});assert.equal(bridge.report().state.view,'system');assert.throws(()=>bridge.navigate({group:'analysis',value:'fairmr'}));
assert.ok(!JSON.stringify(bridge.report()).includes('token-expiry'));
toggle.click();assert.equal(tools.size,0);assert.equal(bridge.status().active,false);assert.equal($('character').closest('label').hidden,false);assert.equal($('character').value,'TERRY');assert.throws(()=>bridge.report());
toggle.click();await wait(()=>!toggle.disabled);assert.equal(bridge.status().active,true);toggle.click();await w.happyDOM.close();
console.log('Dashboard SDK: actual SDK, 16 selects, all views, scope, native restoration, simulation passed');
