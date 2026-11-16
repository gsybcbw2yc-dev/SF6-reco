// Run from repository root with happy-dom installed. Uses the actual vendored SDK.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Window} from 'happy-dom';
const w=new Window({url:'https://example.test/SF6-reco/'});
for(const key of Object.getOwnPropertyNames(w)){
  if(!(key in globalThis))try{globalThis[key]=w[key];}catch{}
}
for(const key of ['window','document','HTMLElement','Element','Node','Event','CustomEvent','MutationObserver','Option','HTMLSelectElement','customElements','getComputedStyle','requestAnimationFrame','cancelAnimationFrame','ResizeObserver','IntersectionObserver','DOMRect','HTMLButtonElement','HTMLInputElement','HTMLFormElement','ShadowRoot','Document','CSS','navigator','addEventListener','removeEventListener','dispatchEvent']){
  if(w[key]!==undefined)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:typeof w[key]==='function'&&/^(getComputedStyle|requestAnimationFrame|cancelAnimationFrame|addEventListener|removeEventListener|dispatchEvent)$/.test(key)?w[key].bind(w):w[key]});
}
globalThis.window=w;
globalThis.Option=function(label,value){const e=w.document.createElement('option');e.textContent=label;e.value=value;return e;};
// happy-dom does not yet implement ElementInternals; these form-only hooks
// are irrelevant to this non-form analysis and are not mocked in production.
w.HTMLElement.prototype.attachInternals??=function(){return {setFormValue(){},setValidity(){},form:null,labels:[],states:new Set()};};
const html=fs.readFileSync('web/index.html','utf8');
w.document.body.innerHTML='<div id="analysis-fairmr">'+html.split('<section class="panel fairmr-panel"')[1].split('</section>\n</div>')[0].replace(/^/,'<section class="panel fairmr-panel"')+'</div>';
// Use the real scripts with the same globals as the browser.
for(const path of ['phase-config','fair-rating','match-deltas','training-insights','fair-rating-ui']){
  const source=fs.readFileSync('web/'+path+'.js','utf8');(0,eval)(source);
}
w.SF6FairRatingUI=globalThis.SF6FairRatingUI;
const rows=[];
for(const character of ['AKUMA','TERRY'])for(const phase of ['14','15'])for(let i=0;i<60;i++){
  rows.push({key:character+phase+i,occurred_at:new Date(Date.UTC(2026,10,Number(phase)-10+Math.floor(i/20),0,i%20*3)).toISOString(),character,opponent_character:'RYU',mode:'ranked',phase,mr_before:1400,opponent_mr_before:1200+i*6,outcome:i%3===0?'loss':'win'});
}
globalThis.SF6FairRatingUI.render(rows);
const tools=new Map();
w.document.modelContext={registerTool(tool,{signal}){tools.set(tool.name,tool);signal.addEventListener('abort',()=>tools.delete(tool.name));}};
await import('../web/fair-sdk-pilot.js');
const toggle=w.document.getElementById('fair-sdk-toggle');
const wait=async fn=>{for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,20));}throw Error(w.document.getElementById('fair-sdk-status').textContent);};
toggle.click();await wait(()=>!toggle.disabled);
const bridge=w.SF6FairSDK;
assert.equal(bridge.status().active,true);
assert.equal(tools.size,4);
const components=bridge.snapshot();
assert.equal(components.length,3);
assert.equal((await bridge.query({kind:'select'})).length,3);
assert.ok((await bridge.query({within:components[0].ref}))[0].items.length);
const act=async(label,value)=>bridge.act({steps:[{ref:components.find(c=>c.label.endsWith(label)).ref,action:'setValue',args:[value]}]});
assert.equal((await act('キャラクター','TERRY')).ok,true);
assert.equal(w.document.getElementById('fair-character').value,'TERRY');
assert.equal((await act('ACT','act:14')).ok,true);
assert.equal((await act('集計窓','50')).ok,true);
assert.equal(bridge.report().character,'TERRY');
assert.equal(bridge.report().act,'act:14');
assert.equal(bridge.report().window,50);
const nativeWindow=w.document.getElementById('fair-window');
nativeWindow.value='200';nativeWindow.dispatchEvent(new w.Event('change',{bubbles:true}));
assert.equal(bridge.report().window,200);
assert.equal(bridge.snapshot().find(x=>x.label.endsWith('集計窓')).value,'200');
assert.equal((await act('集計窓','50')).ok,true);
assert.equal(bridge.report().sample,60);
assert.equal((await act('集計窓','999')).ok,false);
assert.equal(bridge.report().window,50);
assert.equal((await bridge.act({steps:[{ref:components[0].ref,action:'setOpen',args:[true]}]})).ok,false);
assert.equal((await tools.get('sf6_fair_report').execute({})).window,50);
const panel=w.document.getElementById('analysis-fairmr');
panel.hidden=true;assert.throws(()=>bridge.report());panel.hidden=false;
toggle.click();assert.equal(bridge.status().active,false);assert.equal(tools.size,0);
assert.equal(w.document.getElementById('fair-window').value,'50');
assert.equal(w.document.getElementById('fair-window').closest('label').hidden,false);
toggle.click();await wait(()=>!toggle.disabled);
assert.equal(bridge.snapshot().length,3);assert.equal(bridge.report().window,50);
toggle.click();await w.happyDOM.close();
console.log('Fair SDK pilot: actual SDK, bridge, scope, native state and mocked WebMCP passed');
