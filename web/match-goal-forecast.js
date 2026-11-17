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
  const HORIZONS=[100,200,500],TRIALS=2000;
  function simulate({rows,deltas,current,stale,targets=GOALS,act,observedAt}){
    const result={horizons:HORIZONS,trials:TRIALS,known:0,blocks:0,covered:0,targets:targets.map(target=>({target,probabilities:HORIZONS.map(()=>finite(current)&&current>=target?1:null)})),reason:''};
    if(!finite(current)||current<=0||stale||!Number.isInteger(act)){result.reason='現在MR・公式Actの更新待ち';return result;}
    const recent=rows.slice(0,100).reverse();
    const known=recent.map(r=>{const d=deltas.get(r.key);return d&&['verified','inferred'].includes(d.basis)&&finite(d.delta)?d.delta:null;});
    result.known=known.filter(finite).length;
    if(recent.length<100||result.known<70){result.reason='直近100試合・MR差分70件以上が必要';return result;}
    if(Date.parse(recent.at(-1).occurred_at)>Date.parse(observedAt)){result.reason='最新試合後のMR定期観測待ち';return result;}
    // Moving blocks of five observed consecutive games retain short-term dependencies.
    const blocks=[],covered=new Set();
    for(let i=0;i+5<=recent.length;i++){
      const slice=known.slice(i,i+5);if(!slice.every(finite))continue;
      const unique=recent.slice(i,i+5).every((r,j)=>{const at=Date.parse(r.occurred_at),prev=recent[i+j-1],next=recent[i+j+1];
        return (!prev||Date.parse(prev.occurred_at)<at)&&(!next||Date.parse(next.occurred_at)>at)&&(!j||at-Date.parse(prev.occurred_at)<=600000);});
      if(!unique)continue;
      blocks.push(slice);for(let j=0;j<5;j++)covered.add(i+j);
    }
    result.blocks=blocks.length;result.covered=covered.size;
    if(blocks.length<10||covered.size<50){result.reason='連続5試合のまとまりが不足';return result;}
    let state=20261115;const rand=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
    const counts=targets.map(()=>HORIZONS.map(()=>0));
    for(let trial=0;trial<TRIALS;trial++){
      let mr=current,max=current;
      for(let i=0;i<500;){const block=blocks[Math.floor(rand()*blocks.length)];for(const delta of block){
        mr+=delta;max=Math.max(max,mr);i++;
        const h=HORIZONS.indexOf(i);if(h>=0)targets.forEach((target,t)=>{if(max>=target)counts[t][h]++;});
      }}
    }
    result.targets=targets.map((target,i)=>({target,probabilities:counts[i].map(n=>n/TRIALS)}));
    result.reason='ready';return result;
  }
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
    const phaseAct=latest&&/^\d{1,3}$/.test(String(latest.phase))?Number(latest.phase):null;
    const act=phaseAct??(latest?.phase==='unknown'?actAt(observedAt):null);
    const compatible=r=>!latest||
      (r.phase===latest.phase&&(r.phase!=='unknown'||act===null||actAt(r.occurred_at)===act))||
      (r.phase==='unknown'&&act!==null&&actAt(r.occurred_at)===act);
    const ranked=[...new Map(rows.filter(r=>r.mode==='ranked'&&r.character===character&&validTime(r.occurred_at)&&
      (phase==='all'||r.phase===phase||
        (r.phase==='unknown'&&/^\d{1,3}$/.test(String(phase))&&actAt(r.occurred_at)===Number(phase)))&&
      compatible(r)&&r.key)
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
      if(phase!=='all'&&s.phase!==phase&&
         !(s.phase==='unknown'&&/^\d{1,3}$/.test(String(phase))&&actAt(s.start)===Number(phase)))continue;
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
    const sameAct=[...new Map(rows.filter(r=>r.key&&r.mode==='ranked'&&r.character===character&&validTime(r.occurred_at)&&Number.isInteger(act)&&
      (/^\d{1,3}$/.test(String(r.phase))?Number(r.phase)===act:r.phase==='unknown'&&actAt(r.occurred_at)===act)&&Date.parse(r.occurred_at)<=now)
      .map(r=>[r.key,r])).values()].sort((a,b)=>Date.parse(b.occurred_at)-Date.parse(a.occurred_at)||String(a.key).localeCompare(String(b.key)));
    const simulation=simulate({rows:sameAct,deltas,current,stale,targets,act,observedAt});
    return {character,phase,act,current,observedAt,stale,storedGames:ranked.length,
      cohort,targets,audit,simulation,method:'next_ranked_pre_match_or_periodic_snapshot_mr_delta',minCoverage:MIN_COVERAGE};
  }
  return {analyze,simulate,renderCount,WINDOWS,GOALS,MIN_COVERAGE,MAX_AGE_MS};
});

