const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

class Element {
  constructor(value = '') {
    this.value = value;
    this.textContent = '';
    this.options = [];
    this.classList = { add() {}, remove() {}, toggle() {} };
    this.dataset = {};
    this.style = {};
    this.children = [];
    this.attributes = {};
    this.listeners = {};
  }
  add(option) { this.options.push(option); }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute(key,value) { this.attributes[key] = value; }
  addEventListener(name,cb) { this.listeners[name] = cb; }
  emit(name,event={}) { this.listeners[name]?.({preventDefault(){},...event}); }
  getBoundingClientRect() { return { left: 0, top: 0 }; }
}

async function run() {
  const nodes = new Map();
  const element = id => nodes.get(id) || (nodes.set(id, new Element()), nodes.get(id));
  element('character').value = 'すべて';
  element('character').add({ value: 'すべて' });
  element('phase').value = 'all';
  element('phase').add({ value: 'all' });
  const listeners = {}, windows = {}, timers = [];
  const layerButtons=[];
  for(const key of ['mr','lp'])for(const layer of ['observed','average','regression']){
    const button=new Element();
    button.dataset={chart:key,layer};
    layerButtons.push(button);
  }
  element('mr-chart').clientWidth = 340;
  element('mr-chart').clientHeight = 176;
  const document = {
    hidden: false,
    getElementById: element,
    createElement: () => new Element(),
    createElementNS: (namespaceURI,tagName) => Object.assign(new Element(), { namespaceURI,tagName }),
    querySelector: () => new Element(),
    querySelectorAll: selector => selector==='[data-chart][data-layer]'?layerButtons:[],
    addEventListener: (name, cb) => { listeners[name] = cb; },
  };
  const window = { addEventListener: (name, cb) => { windows[name] = cb; } };
  let nowMs = Date.parse('2026-11-08T04:00:00Z'), calls = 0, fail = false, held;
  let snapshot = { history: { observations: [{ character: 'AKUMA', mr: 1411, lp: 99763, phase: 'unknown', observed_at: '2026-11-08T03:00:00Z' }] }, status: { last_success: '2026-11-08T03:00:00Z' }, runs: { events: [] } };
  class Clock extends Date { static now() { return nowMs; } }
  const fetch = async url => {
    calls++;
    if (held) await held;
    if (fail) throw new Error('offline');
    const name = url.match(/data\/(history|status|runs)\.json/)[1];
    return { ok: true, json: async () => structuredClone(snapshot[name]) };
  };
  const context = vm.createContext({ document, window, fetch, Date: Clock, Option: class { constructor(label, value) { this.value = value;this.label=label; } }, setInterval: cb => timers.push(cb), setTimeout() {}, URL: {}, Blob, innerWidth: 1024 });
  vm.runInContext(fs.readFileSync('web/time-analysis.js', 'utf8'), context);
  vm.runInContext(fs.readFileSync('web/time-analysis-ui.js', 'utf8'), context);
  vm.runInContext(fs.readFileSync('web/chart-trends.js', 'utf8'), context);
  vm.runInContext(fs.readFileSync('web/phase-config.js', 'utf8'), context);
  vm.runInContext(fs.readFileSync('web/app.js', 'utf8'), context);
  const flush = () => new Promise(resolve => setImmediate(resolve));
  await flush();
  assert.equal(calls, 3);
  assert.equal(element('mr').textContent, '1,411');
  assert.equal(element('phase').options.find(p=>p.value==='unknown')?.label,'Act 14（暫定）');
  assert.equal(element('mr-chart').children[0].attributes.viewBox, '0 0 340 176'); // portrait chart fills actual available space
  assert.equal(typeof window.onSf6ViewChange, 'function');
  // iOS regression: points open an inline card readout, never a fixed tooltip.
  const point = element('mr-chart').children[0].children.find(node => node.tagName === 'circle');
  assert.ok(point);
  assert.equal(element('mr-point-detail').hidden, true);
  point.emit('click');
  assert.equal(element('mr-point-detail').hidden, false);
  assert.match(element('mr-point-reading').textContent, /MR 1,411/);
  assert.equal(point.attributes['aria-pressed'], 'true');
  point.emit('click'); // same point closes it
  assert.equal(element('mr-point-detail').hidden, true);
  point.emit('keydown',{key:'Enter'}); // keyboard selection
  assert.equal(element('mr-point-detail').hidden, false);
  point.emit('keydown',{key:'Escape'}); // keyboard dismissal
  assert.equal(element('mr-point-detail').hidden, true);
  point.emit('keydown',{key:' '});
  assert.equal(element('mr-point-detail').hidden, false);
  element('mr-point-close').onclick(); // explicit close control
  assert.equal(element('mr-point-detail').hidden, true);
  assert.equal(element('lp-point-detail').hidden, true);

  assert.match(element('last-check').textContent, /11\/8/);
  assert.match(element('last-sync').textContent, /12:00/);
  assert.match(element('cadence').textContent, /成功間隔平均/);
  assert.match(element('time-summary').textContent, /有効窓.*算定不可/);

  element('character').value = 'AKUMA';
  vm.runInContext("range='30'", context);
  nowMs += 60_000;
  snapshot.history.observations.push({ character: 'AKUMA', mr: 1372, lp: 100843, phase: 'unknown', observed_at: '2026-11-08T04:01:00Z' });
  snapshot.status.last_success = '2026-11-08T04:01:00Z';
  timers[0](); await flush();
  assert.equal(calls, 6);
  assert.equal(element('mr').textContent, '1,372');
  assert.equal(element('lp').textContent, '100,843');
  assert.equal(element('mr-point-detail').hidden, true); // data redraw clears stale selection
  assert.equal(element('mr-chart').children[0].children.filter(x=>x.tagName==='circle').length, 2);
  // Both charts have their own independent layer toggles. No network access on switching.
  const observedMr=layerButtons.find(b=>b.dataset.chart==='mr'&&b.dataset.layer==='observed');
  const averageMr=layerButtons.find(b=>b.dataset.chart==='mr'&&b.dataset.layer==='average');
  const observedLp=layerButtons.find(b=>b.dataset.chart==='lp'&&b.dataset.layer==='observed');
  const initialCalls=calls;
  observedMr.onclick();
  assert.equal(observedMr.attributes['aria-pressed'],'false');
  assert.equal(element('mr-chart').children[0].children.some(x=>x.tagName==='circle'),false);
  assert.equal(element('lp-chart').children[0].children.some(x=>x.tagName==='circle'),true);
  assert.equal(calls,initialCalls);
  observedMr.onclick();
  assert.equal(observedMr.attributes['aria-pressed'],'true');
  averageMr.onclick();
  assert.equal(averageMr.attributes['aria-pressed'],'false');
  observedLp.onclick();
  assert.equal(observedLp.attributes['aria-pressed'],'false');
  observedLp.onclick();
  assert.equal(observedLp.attributes['aria-pressed'],'true');
  averageMr.onclick();
  assert.equal(averageMr.attributes['aria-pressed'],'true');
  assert.equal(element('character').value, 'AKUMA');
  assert.equal(vm.runInContext('range', context), '30');

  document.hidden = true; nowMs += 60_000; timers[0](); await flush();
  assert.equal(calls, 6);
  document.hidden = false; listeners.visibilitychange(); await flush();
  assert.equal(calls, 9);
  windows.pageshow(); windows.focus(); await flush();
  assert.equal(calls, 9); // quick duplicate resume events are throttled

  fail = true; nowMs += 60_000; element('refresh').onclick(); await flush();
  assert.equal(element('mr').textContent, '1,372');
  assert.match(element('refresh-state').textContent, /通信エラー/);
  fail = false; element('refresh').onclick(); await flush();
  assert.match(element('refresh-state').textContent, /画面確認/);

  held = new Promise(resolve => { context.releaseFetch = resolve; });
  nowMs += 60_000; timers[0](); element('refresh').onclick(); windows.focus();
  assert.equal(calls, 18); // only one three-file request is in flight
  context.releaseFetch(); await flush();
  assert.equal(element('refresh').disabled, false);
  snapshot.history.observations.push(
    {character:'AKUMA',mr:1382,lp:100923,phase:'unknown',observed_at:'2026-11-08T04:30:00Z'},
    {character:'AKUMA',mr:1392,lp:101023,phase:'unknown',observed_at:'2026-11-08T05:00:00Z'}
  );
  snapshot.status.last_success='2026-11-08T05:00:00Z';
  nowMs+=60_000; timers[0](); await flush();
  assert.match(element('mr-slope').textContent,/MR\/時/);
  const svg=element('mr-chart').children[0];
  assert.ok(svg.children.some(x=>x.tagName==='polyline'&&x.attributes['data-chart-line']==='average'));
  assert.ok(svg.children.some(x=>x.tagName==='line'&&x.attributes['data-chart-line']==='regression'));
  // Regression toggle removes only regression line, not the observed SVG circles.
  const regressionMr=layerButtons.find(b=>b.dataset.chart==='mr'&&b.dataset.layer==='regression');
  regressionMr.onclick();
  assert.equal(element('mr-chart').children[0].children.some(x=>x.attributes['data-chart-line']==='regression'),false);
  assert.equal(element('mr-chart').children[0].children.filter(x=>x.tagName==='circle').length,4);
  regressionMr.onclick();
  assert.equal(element('mr-chart').children[0].children.some(x=>x.attributes['data-chart-line']==='regression'),true);
  // Recompute match-based target forecasts immediately on character/phase changes.
  let matchForecastRenders=0;
  window.matchDashboard={render(){matchForecastRenders++;}};
  element('character').onchange();
  element('phase').onchange();
  assert.equal(matchForecastRenders,2);
  delete window.matchDashboard;
  // Terry has LP but no measured Master Rating. Character selection must
  // synchronize with match archive without corrupting Akuma's stored series.
  snapshot.history.observations.push({
    character:'TERRY',mr:0,lp:22617,phase:'unknown',
    observed_at:new Date(nowMs).toISOString()
  });
  nowMs+=60_000;
  element('refresh').onclick(); await flush();
  assert.ok(element('character').options.some(o=>o.value==='TERRY'));
  element('match-character').add({value:'TERRY'});
  element('character').value='TERRY';
  element('character').onchange();
  assert.equal(element('match-character').value,'TERRY');
  assert.equal(element('mr').textContent,'未計測');
  assert.equal(element('lp').textContent,'22,617');
  assert.equal(element('mr-chart').children.length,0);
  assert.equal(element('lp-chart').children.length,1);
  window.onSf6MatchCharacterChange('AKUMA');
  assert.equal(element('character').value,'AKUMA');
  assert.equal(element('mr').textContent,'1,392');
  console.log('Dashboard refresh, Terry LP-only mode, character sync, chart regression passed');
}
run().catch(e => { console.error(e); process.exitCode = 1; });
