/* Non-Master -> Master promotion forecast, based on observed LP and cautious
 * neighboring pre-match LP differences. This is an estimate, not settled LP.
 * Only rank-matches count; missing battles are never filled with 0 LP.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.SF6MasterPromotion=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const TARGET=25000,WINDOWS=[20,50,100],MIN_COVERAGE=.7;
  const MAX_AGE=3*3600000,MAX_GAP=10,MAX_ABS_LP=2000,MAX_GAMES=10000;
  const finite=n=>typeof n==='number'&&Number.isFinite(n);
  const usable=n=>finite(n)&&n>0;
  const stamp=s=>Date.parse(s||'');
  function latestStatus(observations,character){
    const candidates=observations.filter(x=>x.character===character&&Number.isFinite(stamp(x.observed_at)))
      .slice().sort((a,b)=>stamp(a.observed_at)-stamp(b.observed_at));
    const latest=candidates.at(-1)??null;
    const lastLP=candidates.filter(x=>usable(x.lp)).at(-1)??null;
    const master=candidates.some(x=>usable(x.mr)||finite(x.lp)&&x.lp>=TARGET);
    return {mode:master?'mr':'lp',character,latest,
      currentLP:lastLP?.lp??null,lpObservedAt:lastLP?.observed_at??null,
      lastMR:candidates.filter(x=>usable(x.mr)).at(-1)?.mr??null,
      reached:master};
  }
  function inferLP(rows,actAt=()=>null){
    const sorted=rows.filter(x=>x&&Number.isFinite(stamp(x.occurred_at))).slice()
      .sort((a,b)=>stamp(a.occurred_at)-stamp(b.occurred_at)||
        String(a.key||'').localeCompare(String(b.key||'')));
    const map=new Map();
    const notReady=reason=>({delta:null,basis:'unavailable',reason});
    for(let i=0;i<sorted.length;i++){
      const a=sorted[i],b=sorted[i+1];
      if(!a.key)continue;
      if(a.delta_basis==='verified_post_match_rating'&&finite(a.lp_delta)){
        map.set(a.key,{delta:a.lp_delta,basis:'verified',reason:'対戦後LPを検証した値'});continue;
      }
      if(a.mode!=='ranked'){map.set(a.key,notReady('ランクマッチ以外'));continue;}
      if(!b){map.set(a.key,notReady('次の対戦前LPが未取得'));continue;}
      const gap=(stamp(b.occurred_at)-stamp(a.occurred_at))/60000;
      if(!(gap>0&&gap<=MAX_GAP)){
        map.set(a.key,notReady('次試合まで10分超、または時刻の順序不明'));continue;
      }
      if(sorted[i-1]?.occurred_at===a.occurred_at||sorted[i+2]?.occurred_at===b.occurred_at){
        map.set(a.key,notReady('同時刻の試合があり、順序不明'));continue;
      }
      if(b.mode!=='ranked'||a.character!==b.character||a.phase!==b.phase||
         a.phase==='unknown'&&actAt(a.occurred_at)!==actAt(b.occurred_at)){
        map.set(a.key,notReady('次試合のモード・キャラ・フェーズが異なる'));continue;
      }
      if(!usable(a.lp_before)||!usable(b.lp_before)){
        map.set(a.key,notReady('対戦前LPが不足'));continue;
      }
      const delta=b.lp_before-a.lp_before;
      if(Math.abs(delta)>MAX_ABS_LP){
        map.set(a.key,notReady('LP差が大きく、未取得試合などの可能性'));continue;
      }
      if(!['win','loss','draw'].includes(a.outcome)||
         a.outcome==='win'&&delta<=0||a.outcome==='loss'&&delta>=0||
         a.outcome==='draw'&&delta!==0){
        map.set(a.key,notReady('勝敗とLP増減が整合しない'));continue;
      }
      map.set(a.key,{delta,basis:'inferred',reason:
        `次試合まで${gap.toFixed(1)}分。連続する対戦前LP差の参考推定`});
    }
    return map;
  }
  function rankLabel(lp){
    if(!usable(lp))return 'LP未取得';
    if(lp>=TARGET)return 'マスター';
    const bands=[[19000,'ダイヤモンド',1200],[13000,'プラチナ',1200],[9000,'ゴールド',800],
      [5000,'シルバー',800],[3000,'ブロンズ',400],[1000,'アイアン',400],[0,'ルーキー',200]];
    const [base,label,step]=bands.find(([threshold])=>lp>=threshold);
    return `${label} ★${Math.min(5,Math.floor((lp-base)/step)+1)}`;
  }
  function analyze({rows=[],observations=[],character,phase='all',now=Date.now(),
                   actAt=()=>null,sessionRefs=new Map(),sessions=[],deltas=null}={}){
    const status=latestStatus(observations,character);
    const current=status.currentLP;
    const remaining=current===null?null:Math.max(0,TARGET-current);
    const stale=!status.lpObservedAt||now-stamp(status.lpObservedAt)>MAX_AGE||
      now-stamp(status.lpObservedAt)<-10*60000;
    const inferred=deltas??inferLP(rows,actAt);
    const currentPhase=status.latest?.phase??null;
    const currentAct=currentPhase==='unknown'?actAt(status.latest?.observed_at):null;
    const ranked=[...new Map(rows.filter(r=>r&&r.key&&r.mode==='ranked'&&r.character===character&&
      Number.isFinite(stamp(r.occurred_at))&&(phase==='all'||r.phase===phase)&&
      (!currentPhase||r.phase===currentPhase)&&
      (currentAct===null||r.phase!=='unknown'||actAt(r.occurred_at)===currentAct))
      .map(r=>[r.key,r])).values()]
      .sort((a,b)=>stamp(b.occurred_at)-stamp(a.occurred_at)||String(a.key).localeCompare(String(b.key)));
    const cohorts=WINDOWS.map(size=>{
      const group=ranked.slice(0,size);
      const accepted=group.filter(r=>{
        const change=inferred.get(r.key);
        return change&&(change.basis==='inferred'||change.basis==='verified')&&finite(change.delta);
      });
      const total=accepted.reduce((sum,r)=>sum+inferred.get(r.key).delta,0);
      const average=accepted.length?total/accepted.length:null;
      const wins=group.filter(r=>r.outcome==='win').length,losses=group.filter(r=>r.outcome==='loss').length;
      const draws=group.filter(r=>r.outcome==='draw').length;
      const coverage=accepted.length/size;
      const state=group.length<size?'insufficient_matches':
        coverage<MIN_COVERAGE?'low_coverage':
        average===null?'no_deltas':average<=0?'no_positive_growth':
        stale?'stale':'ready';
      let required=null,label;
      if(remaining===0){required=0;label='達成済み';}
      else if(status.mode==='mr')label='マスター到達済み';
      else if(remaining===null)label='LP未取得';
      else if(state==='stale')label='LP更新待ち';
      else if(state==='no_positive_growth')label='増加傾向なし';
      else if(state!=='ready')label='データ不足';
      else {
        const computed=Math.ceil(remaining/average-1e-12);
        if(computed>MAX_GAMES)label='1万試合超（範囲外）';
        else {required=computed;label=`約${computed.toLocaleString('ja-JP')}試合`;}
      }
      return {size,totalMatches:group.length,known:accepted.length,coverage,average,
        wins,losses,draws,winRate:wins+losses+draws?100*wins/(wins+losses+draws):null,
        lpTotal:total,state,required,label};
    });
    // Compare reconstructed LP for whole sessions against existing snapshot-
    // corroborated session boundaries; do not fill missing per-match changes.
    const audit={checked:0,matched:0,provisional:0,conflict:0,residuals:[]};
    for(const session of sessions){
      if(session.characters?.length!==1||session.characters[0]!==character)continue;
      if(phase!=='all'&&session.phase!==phase)continue;
      const ref=sessionRefs.get(session.key);
      if(!ref)continue;
      const within=ranked.filter(r=>stamp(r.occurred_at)>=stamp(session.start)&&
        stamp(r.occurred_at)<=stamp(session.end));
      if(within.length!==session.games)continue;
      const covered=within.filter(r=>finite(inferred.get(r.key)?.delta));
      const partial=covered.reduce((sum,r)=>sum+inferred.get(r.key).delta,0);
      audit.checked++;
      if(ref.status==='snapshot_matched')audit.matched++;
      if(ref.status==='snapshot_provisional')audit.provisional++;
      if(ref.status==='conflict')audit.conflict++;
      audit.residuals.push({status:ref.status,games:session.games,known:covered.length,
        referenceLP:ref.lp,partialLP:partial,difference:finite(ref.lp)?ref.lp-partial:null});
    }
    return {status,mode:status.mode,character,currentLP:current,remaining,
      target:TARGET,rank:rankLabel(current),lpObservedAt:status.lpObservedAt,stale,
      storedGames:ranked.length,cohorts,audit,phase,currentAct};
  }
  return {TARGET,WINDOWS,MIN_COVERAGE,MAX_AGE,latestStatus,rankLabel,inferLP,analyze};
});
