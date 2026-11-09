/* Fixed JST-aligned observation windows. No interpolation or play-time inference. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SF6Analysis = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  const JST = 9 * 60 * 60 * 1000;
  const TOLERANCE = 5 * 60 * 1000;
  const ALLOWED = [30, 60, 180, 1440];
  function analyze(observations, { character, phase = 'all', range = '7', minutes = 60, now = Date.now() }) {
    if (!ALLOWED.includes(minutes)) throw new RangeError('Invalid fixed window');
    const cutoff = range === 'all' ? -Infinity : now - Number(range) * 86400000;
    const selected = observations.filter(p => p.character === character && p.mr != null && Number.isFinite(Date.parse(p.observed_at)))
      .map(p => ({ ...p, time: Date.parse(p.observed_at) }))
      .filter(p => p.time >= cutoff && p.time <= now && (phase === 'all' || p.phase === phase))
      .sort((a, b) => a.time - b.time);
    // For 'all', only the latest contiguous same-phase segment is comparable.
    const lastPhase = selected.at(-1)?.phase;
    let segment = selected;
    if (phase === 'all' && selected.length) {
      let i = selected.length - 1;
      while (i > 0 && selected[i - 1].phase === lastPhase) i--;
      segment = selected.slice(i);
    }
    const width = minutes * 60000;
    const bars = [];
    if (segment.length) {
      const start = Math.ceil((segment[0].time - TOLERANCE + JST) / width) * width - JST;
      const end = Math.floor((segment.at(-1).time + JST) / width) * width - JST;
      // Limit an excessively long unobserved history to practical display and computation.
      for (let boundary = Math.max(start, end - 20000 * width); boundary + width <= end; boundary += width) {
        const at = t => segment.find(p => p.time >= t && p.time <= t + TOLERANCE);
        const first = at(boundary), last = at(boundary + width);
        const valid = first && last && first.time < last.time && first.phase === last.phase;
        bars.push({ start: boundary, end: boundary + width, delta: valid ? last.mr - first.mr : null,
          rate: valid ? (last.mr - first.mr) * 60 / minutes : null,
          observedStart: first?.observed_at || null, observedEnd: last?.observed_at || null });
      }
    }
    const validBars = bars.filter(b => b.delta !== null);
    const recent = validBars.slice(-6);
    const peak = segment.length ? Math.max(...segment.map(p => p.mr)) : null;
    const current = segment.at(-1)?.mr ?? null;
    let high = -Infinity, maxDrawdown = 0;
    const highRecords = [];
    for (const p of segment) {
      if (p.mr > high) { high = p.mr; highRecords.push({ observed_at: p.observed_at, mr: p.mr }); }
      maxDrawdown = Math.max(maxDrawdown, high - p.mr);
    }
    return { bars, validBars, segment, lastPhase, selectedCount: selected.length,
      maxRise: validBars.length ? Math.max(...validBars.map(b => b.delta)) : null,
      maxFall: validBars.length ? Math.min(...validBars.map(b => b.delta)) : null,
      averageRate: recent.length ? recent.reduce((n, b) => n + b.rate, 0) / recent.length : null,
      peak, current, belowPeak: peak === null ? null : peak - current,
      toNewHigh: peak === null ? null : Math.max(0, peak + 1 - current), maxDrawdown,
      highRecords, recordCount: Math.max(0, highRecords.length - 1), firstAt: segment[0]?.observed_at ?? null, lastAt: segment.at(-1)?.observed_at ?? null };
  }
  return { analyze };
});
