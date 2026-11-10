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
    return rows.length && rows[0].phase !== 'unknown' && rows.every(r => r.phase === rows[0].phase &&
      r.character === rows[0].character && r.delta_basis === 'verified_post_match_rating' && Number.isFinite(r[key]))
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
      return { ...stats(matches), key: first.key, endKey: last.key,
        startMr: first.mr_before, startLp: first.lp_before,
        start: first.occurred_at, end: last.occurred_at,
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

  /**
   * Reconstruct session-level *reference* deltas from next session's verified pre-match
   * values (and independent periodic snapshots). They are NOT exact per-match deltas.
   * Return values must not overwrite mrDelta/lpDelta or imply full battlelog coverage.
   */
  function reconcileSessionDeltas(rows, observations = [], gapMinutes = 45) {
    const ranked=rows.filter(r=>r.mode==='ranked');
    const chronological=sessions(ranked,gapMinutes).reverse();
    const snapRows=Array.isArray(observations)?observations:[];
    const byStart=new Map();
    for(let i=0;i<chronological.length;i++){
      const current=chronological[i],next=chronological[i+1];
      const base={key:current.key,endKey:current.endKey,games:current.games,
        startMr:current.startMr,startLp:current.startLp,
        mr:null,lp:null,status:'unavailable',snapshots:0,
        endObservationAt:null,nextStart:next?.start??null,reason:'',
        gapMinutes:next?(Date.parse(next.start)-Date.parse(current.end))/60000:null};
      const output=(changes)=>byStart.set(current.key,{...base,...changes});
      if(current.orderUncertain||current.characters.length!==1){
        output({reason:'同時刻の試合・キャラ混在があるため比較不可'});continue;
      }
      if(!Number.isFinite(current.startMr)||!Number.isFinite(current.startLp)){
        output({reason:'セッション開始時のMR/LPが不明'});continue;
      }
      const startTime=Date.parse(current.end);
      const finishTime=next?Date.parse(next.start):startTime+3*3600000;
      const post=snapRows.filter(o=>o.character===current.characters[0]&&
        o.phase===current.phase&&Number.isFinite(o.mr)&&Number.isFinite(o.lp)&&
        Number.isFinite(Date.parse(o.observed_at))&&
        Date.parse(o.observed_at)>startTime&&Date.parse(o.observed_at)<finishTime)
        .sort((a,b)=>Date.parse(a.observed_at)-Date.parse(b.observed_at));
      if(next){
        if(next.orderUncertain||next.characters.length!==1||
           next.characters[0]!==current.characters[0]||next.phase!==current.phase){
          output({reason:'次セッションとキャラ・フェーズ・時系列が比較不可'});continue;
        }
        if(!Number.isFinite(next.startMr)||!Number.isFinite(next.startLp)){
          output({reason:'次セッション初戦の対戦前MR/LPが不明'});continue;
        }
        const conflict=post.some(o=>o.mr!==next.startMr||o.lp!==next.startLp);
        if(conflict){
          output({status:'conflict',snapshots:post.length,
            reason:'セッション間の定期観測値が次セッション開始値と一致せず、未取得試合などの可能性あり'});continue;
        }
        output({status:post.length?'snapshot_matched':'next_session_only',
          mr:next.startMr-current.startMr,lp:next.startLp-current.startLp,
          snapshots:post.length,
          endObservationAt:post.at(-1)?.observed_at??next.start,
          reason:post.length?'次セッション初戦前値と途中の定期観測値が一致':'次セッション初戦前値のみ（定期観測の裏付けなし）'});
        continue;
      }
      // Latest session: use only stable near-term *post-session* snapshots, never
      // extrapolate from the final match's pre-match rating.
      const stable=post.filter(o=>Date.parse(o.observed_at)-startTime>=10*60000);
      if(!stable.length){
        output({reason:'次セッションの開始値、または終了10分後以降の定期観測が未取得'});continue;
      }
      const last=stable.at(-1);
      if(stable.some(o=>o.mr!==last.mr||o.lp!==last.lp)){
        output({status:'conflict',snapshots:stable.length,reason:'終了後3時間の観測値に変動があり、収支を特定できない'});continue;
      }
      output({status:'snapshot_provisional',mr:last.mr-current.startMr,
        lp:last.lp-current.startLp,snapshots:stable.length,
        endObservationAt:last.observed_at,
        reason:'終了後の安定した定期観測値。次セッション開始時点では未照合'});
    }
    return byStart;
  }
  return { filter, stats, sessions, matchups, compare, reconcileSessionDeltas };
});
