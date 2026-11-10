/* Match-count-only MR target estimates from recorded ranked battles.
 * Reference deltas are not official settled ratings; never imply a guaranteed result.
 * This module is pure and can be tested with synthetic fixtures.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.SF6MatchGoalForecast=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const WINDOWS=[20,50,100],GOALS=[1500,1600];
  const MAX_AGE_MS=3*60*60*1000,MAX_GAMES=10000,MIN_COVERAGE=.7;
  const finite=n=>typeof n==='number'&&Number.isFinite(n);
  const validTime=x=>typeof x==='string'&&Number.isFinite(Date.parse(x));
  function renderCount(value){
    if(value===0)return '達成済み';
    return Number.isInteger(value)?`約${value.toLocaleString('ja-JP')}試合`:'算定不可';
  }
  function analyze({rows=[],observations=[],deltas=new Map(),sessionRefs=new Map(),
                    sessions=[],character='AKUMA',phase='all',now=Date.now(),
                    actAt=()=>null,targets=GOALS}={}){
    const mrObservations=observations.filter(o=>o.character===character&&finite(o.mr)&&o.mr>0&&validTime(o.observed_at)&&
      (phase==='all'||phase===o.phase)).slice().sort((a,b)=>Date.parse(a.observed_at)-Date.parse(b.observed_at));
    const latest=mrObservations.at(-1);
    const current=latest?.mr??null,observedAt=latest?.observed_at??null;
    const age=latest?now-Date.parse(observedAt):Infinity;
    const stale=age>MAX_AGE_MS||age< -10*60000;
    const act=latest?.phase==='unknown'?actAt(observedAt):null;
    const ranked=[...new Map(rows.filter(r=>r.mode==='ranked'&&r.character===character&&validTime(r.occurred_at)&&
      (phase==='all'||r.phase===phase)&&
      (!latest||r.phase===latest.phase)&&
      (act===null||r.phase!=='unknown'||actAt(r.occurred_at)===act)&&r.key)
      .map(r=>[r.key,r])).values()]
      .sort((a,b)=>Date.parse(b.occurred_at)-Date.parse(a.occurred_at)||String(a.key).localeCompare(String(b.key)));
    const cohort=WINDOWS.map(size=>{
      const matches=ranked.slice(0,size);
      const known=matches.filter(r=>{const d=deltas.get(r.key);return d&&(d.basis==='verified'||d.basis==='inferred')&&finite(d.delta);});
      const wins=matches.filter(r=>r.outcome==='win').length,losses=matches.filter(r=>r.outcome==='loss').length;
      const draws=matches.filter(r=>r.outcome==='draw').length;
      const missing=size-known.length,coverage=known.length/size;
      const net=known.reduce((sum,r)=>sum+deltas.get(r.key).delta,0);
      const average=known.length?net/known.length:null;
      const sampleComplete=matches.length===size;
      const sufficient=sampleComplete&&coverage>=MIN_COVERAGE;
      const status=!sampleComplete?'insufficient_matches':
        coverage<MIN_COVERAGE?'low_coverage':!finite(average)?'no_deltas':
        average<=0?'no_positive_growth':stale?'stale':'ready';
      const targetResults=targets.map(target=>{
        const remaining=current===null?null:Math.max(0,target-current);
        if(remaining===0)return {target,remaining,required:0,label:'達成済み',status:'achieved'};
        if(remaining===null)return {target,remaining,required:null,label:'現在MR不明',status:'unknown_current'};
        if(status!=='ready')return {target,remaining,required:null,
          label:status==='stale'?'MR更新待ち':status==='no_positive_growth'?'増加傾向なし':'データ不足',
          status};
        const required=Math.ceil(remaining/average-1e-12);
        if(required>MAX_GAMES)return {target,remaining,required:null,label:'1万試合超（範囲外）',status:'out_of_range'};
        return {target,remaining,required,label:renderCount(required),status:'estimate'};
      });
      return {size,available:matches.length,known:known.length,missing,coverage,net,average,
        wins,losses,draws,winRate:wins+losses+draws?100*wins/(wins+losses+draws):null,
        status,targets:targetResults};
    });
    // Independent session-boundary checks are shown only as data-quality
    // diagnostics. They must not silently manufacture missing per-match deltas.
    const sessionAudits=[];
    for(const s of sessions){
      if(s.characters?.length!==1||s.characters[0]!==character)continue;
      if(phase!=='all'&&s.phase!==phase)continue;
      if(act!==null&&s.phase==='unknown'&&actAt(s.start)!==act)continue;
      const ref=sessionRefs.get(s.key);
      if(!ref)continue;
      const within=ranked.filter(r=>Date.parse(r.occurred_at)>=Date.parse(s.start)&&
        Date.parse(r.occurred_at)<=Date.parse(s.end));
      if(within.length!==s.games)continue;
      const inferred=within.filter(r=>{const d=deltas.get(r.key);return d&&
        (d.basis==='inferred'||d.basis==='verified')&&finite(d.delta);});
      const sum=inferred.reduce((x,r)=>x+deltas.get(r.key).delta,0);
      const residual=finite(ref.mr)?ref.mr-sum:null;
      sessionAudits.push({
        status:ref.status,gameCount:s.games,estimatedGames:inferred.length,
        unavailable:s.games-inferred.length,referenceMR:ref.mr,
        sumEstimated:sum,residual,observations:ref.snapshots??0,
        fullyExplained:ref.status==='snapshot_matched'&&inferred.length===s.games&&residual===0
      });
    }
    const audit={
      checked:sessionAudits.length,
      snapshotMatched:sessionAudits.filter(s=>s.status==='snapshot_matched').length,
      provisional:sessionAudits.filter(s=>s.status==='snapshot_provisional').length,
      conflict:sessionAudits.filter(s=>s.status==='conflict').length,
      fullyExplained:sessionAudits.filter(s=>s.fullyExplained).length,
      sessions:sessionAudits.slice(0,6)
    };
    return {character,phase,act,current,observedAt,stale,storedGames:ranked.length,
      cohort,targets,audit,method:'next_ranked_pre_match_mr_delta',minCoverage:MIN_COVERAGE};
  }
  return {analyze,renderCount,WINDOWS,GOALS,MIN_COVERAGE,MAX_AGE_MS};
});
