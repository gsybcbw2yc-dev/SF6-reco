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
  }
  add(option) { this.options.push(option); }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute(key,value) { this.attributes[key] = value; }
  addEventListener() {}
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
  element('mr-chart').clientWidth = 340;
  element('mr-chart').clientHeight = 176;
  const document = {
    hidden: false,
    getElementById: element,
    createElement: () => new Element(),
    createElementNS: () => Object.assign(new Element(), { namespaceURI: 'http://www.w3.org/2000/svg' }),
    querySelector: () => new Element(),
    querySelectorAll: () => [],
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
  const context = vm.createContext({ document, window, fetch, Date: Clock, Option: class { constructor(label, value) { this.value = value; } }, setInterval: cb => timers.push(cb), setTimeout() {}, URL: {}, Blob, innerWidth: 1024 });
  vm.runInContext(fs.readFileSync('web/time-analysis.js', 'utf8'), context);
  vm.runInContext(fs.readFileSync('web/time-analysis-ui.js', 'utf8'), context);
  vm.runInContext(fs.readFileSync('web/app.js', 'utf8'), context);
  const flush = () => new Promise(resolve => setImmediate(resolve));
  await flush();
  assert.equal(calls, 3);
  assert.equal(element('mr').textContent, '1,411');
  assert.equal(element('mr-chart').children[0].attributes.viewBox, '0 0 340 176'); // portrait chart fills actual available space
  assert.equal(typeof window.onSf6ViewChange, 'function');
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
  console.log('Dashboard refresh scenarios passed');
}
run().catch(e => { console.error(e); process.exitCode = 1; });
