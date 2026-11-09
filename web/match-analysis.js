(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SF6Matches = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  function filter(rows, { days = '7', mode = 'ranked', character = 'all', ownControl = 'all', opponentControl = 'all', now = Date.now() } = {}) {
    const cutoff = days === 'all' ? -Infinity : now - Number(days) * 86400000;
    return rows.filter(r => (days === 'all' || r.occurred_at && Date.parse(r.occurred_at) >= cutoff) &&
      (!r.occurred_at || Date.parse(r.occurred_at) <= now) &&
      (mode === 'all' || r.mode === mode) && (character === 'all' || r.character === character) &&
      (ownControl === 'all' || r.own_control === ownControl) && (opponentControl === 'all' || r.opponent_control === opponentControl));
  }
  function exactDelta(rows, key) {
    return rows.length && rows.every(r => r.delta_basis === 'verified_post_match_rating' && Number.isFinite(r[key]))
      ? rows.reduce((sum, r) => sum + r[key], 0) : null;
  }
  function stats(rows) {
    const count = outcome => rows.filter(r => r.outcome === outcome).length;
    const wins = count('win'), losses = count('loss'), draws = count('draw'), unknown = rows.length - wins - losses - draws;
    return { games: rows.length, wins, losses, draws, unknown,
      winRate: wins + losses + draws ? wins / (wins + losses + draws) * 100 : null,
      mrDelta: exactDelta(rows, 'mr_delta'), lpDelta: exactDelta(rows, 'lp_delta') };
  }
  function sessions(rows, gapMinutes = 45) {
    if (!Number.isFinite(gapMinutes) || gapMinutes < 1) throw new RangeError('Invalid session gap');
    const chronological = rows.filter(r => r.occurred_at).slice().sort((a,b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at) || a.key.localeCompare(b.key));
    const groups = [];
    for (const row of chronological) {
      const group = groups.at(-1), previous = group?.at(-1);
      if (!previous || Date.parse(row.occurred_at) - Date.parse(previous.occurred_at) >= gapMinutes * 60000 || row.phase !== previous.phase)
        groups.push([row]);
      else group.push(row);
    }
    return groups.map(matches => {
      let winStreak = 0, lossStreak = 0, maxWins = 0, maxLosses = 0;
      for (const row of matches) {
        winStreak = row.outcome === 'win' ? winStreak + 1 : 0;
        lossStreak = row.outcome === 'loss' ? lossStreak + 1 : 0;
        maxWins = Math.max(maxWins, winStreak); maxLosses = Math.max(maxLosses, lossStreak);
      }
      const first = matches[0], last = matches.at(-1);
      const orderUncertain = new Set(matches.map(r => r.occurred_at)).size !== matches.length;
      const comparable = first.phase !== 'unknown' && matches.every(r => r.phase === first.phase && r.character === first.character && r.mode === 'ranked');
      const reference = key => comparable && Number.isFinite(first[key]) && Number.isFinite(last[key]) ? last[key] - first[key] : null;
      return { ...stats(matches), key: first.key, start: first.occurred_at, end: last.occurred_at,
        elapsedMinutes: (Date.parse(last.occurred_at) - Date.parse(first.occurred_at)) / 60000,
        maxWins: orderUncertain ? null : maxWins, maxLosses: orderUncertain ? null : maxLosses,
        orderUncertain, characters: [...new Set(matches.map(r => r.character))],
        referenceMr: matches.length > 1 ? reference('mr_before') : null,
        referenceLp: matches.length > 1 ? reference('lp_before') : null,
        phase: first.phase };
    }).reverse();
  }
  function matchups(rows, order = 'games') {
    const groups = new Map();
    for (const r of rows) {
      const key = JSON.stringify([r.character, r.opponent_character]);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    }
    return [...groups.values()].map(group => ({ ...stats(group), character: group[0].character,
      opponent: group[0].opponent_character, smallSample: group.length < 5 })).sort((a,b) => {
        if (order !== 'games') {
          if (a.smallSample !== b.smallSample) return a.smallSample ? 1 : -1;
          if (a.winRate === null || b.winRate === null) return a.winRate === b.winRate ? 0 : a.winRate === null ? 1 : -1;
          return (order === 'best' ? b.winRate - a.winRate : a.winRate - b.winRate) || b.games - a.games;
        }
        return b.games - a.games || a.opponent.localeCompare(b.opponent);
      });
  }
  function compare(current, previous) {
    if (!current || !previous) return null;
    return { games: current.games - previous.games,
      winRate: current.winRate !== null && previous.winRate !== null ? current.winRate - previous.winRate : null,
      elapsedMinutes: current.elapsedMinutes - previous.elapsedMinutes };
  }
  return { filter, stats, sessions, matchups, compare };
});
